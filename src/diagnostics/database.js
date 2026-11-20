const path = require('node:path');
const { success, warning, error } = require('../utils/diagnosticResult');
const { runCommand } = require('../utils/exec');
const { tcpProbe } = require('../utils/tcp');
const { readEnvFile } = require('../utils/envFile');
const { readPackageJson, declaredDependencies } = require('../utils/project');
const { checkPort } = require('./ports');
const { identifyProcesses } = require('./process');

const ENGINES = Object.freeze([
    {
        id: 'postgres',
        name: 'PostgreSQL',
        port: 5432,
        client: 'psql',
        processNames: ['postgres'],
        protocols: ['postgres:', 'postgresql:'],
        packages: ['pg', 'postgres', 'pg-promise', 'slonik']
    },
    {
        id: 'mysql',
        name: 'MySQL',
        port: 3306,
        client: 'mysql',
        processNames: ['mysqld', 'mariadbd'],
        protocols: ['mysql:', 'mysql2:', 'mariadb:'],
        packages: ['mysql', 'mysql2', 'mariadb']
    }
]);

const CONTAINER_PROCESSES = ['com.docker', 'docker', 'vpnkit', 'orbstack', 'podman', 'gvproxy', 'limactl', 'colima', 'ssh'];

const DEFAULT_URL_PORTS = {
    'postgres:': 5432,
    'postgresql:': 5432,
    'mysql:': 3306,
    'mysql2:': 3306,
    'mariadb:': 3306,
    'mongodb:': 27017,
    'redis:': 6379,
    'rediss:': 6379
};

function parseDatabaseUrl(raw) {
    let url;
    try {
        url = new URL(raw);
    } catch {
        return { valid: false };
    }

    const host = url.hostname.replace(/^\[|\]$/g, '');
    const port = url.port ? Number(url.port) : DEFAULT_URL_PORTS[url.protocol];
    const user = url.username ? `${decodeURIComponent(url.username)}${url.password ? ':****' : ''}@` : '';
    const masked = `${url.protocol}//${user}${host}${url.port ? `:${url.port}` : ''}${url.pathname}`;

    return { valid: true, protocol: url.protocol, host, port, masked };
}

function isProcessFor(engine, proc) {
    const name = proc.name.toLowerCase();
    return engine.processNames.some((n) => name.startsWith(n));
}

function isContainerProxy(proc) {
    const name = proc.name.toLowerCase();
    return CONTAINER_PROCESSES.some((n) => name.startsWith(n));
}

async function checkEngine(engine, { required, exec, identify, probe }) {
    const [clientResult, portCheck] = await Promise.all([
        exec(engine.client, ['--version'], { timeout: 3000 }),
        checkPort(engine.port, { probe })
    ]);

    const details = {
        port: engine.port,
        requiredByProject: required,
        client: clientResult.ok ? clientResult.stdout.trim().split('\n')[0] : null
    };

    if (portCheck.available === null) {
        return error(engine.name, `Could not check whether ${engine.name} is running (${portCheck.problems.join('; ')}).`,
            details, { code: 'PORT_CHECK_FAILED' });
    }

    if (portCheck.available) {
        if (required) {
            return error(engine.name, `This project uses ${engine.name}, but nothing is listening on localhost:${engine.port}.`,
                details, { code: 'DB_NOT_RUNNING' });
        }
        return success(engine.name, `${engine.name} is not running on localhost:${engine.port} (not required by this project).`, details);
    }

    const lookup = await identify(engine.port);
    details.processes = lookup.processes;

    const foreign = lookup.processes.filter((p) => !isProcessFor(engine, p) && !isContainerProxy(p));
    if (lookup.processes.length > 0 && foreign.length === lookup.processes.length) {
        const owners = foreign.map((p) => `${p.name} (PID ${p.pid})`).join(', ');
        return warning(engine.name, `Port ${engine.port} (the default ${engine.name} port) is used by ${owners}, not ${engine.name}.`,
            details, { code: 'DB_PORT_CONFLICT' });
    }

    const viaContainer = lookup.processes.length > 0 && lookup.processes.every(isContainerProxy);
    return success(engine.name, `${engine.name} is accepting connections on localhost:${engine.port}${viaContainer ? ' (through a container)' : ''}.`, details);
}

async function checkDatabaseUrl(rawUrl, { probe }) {
    const name = 'DATABASE_URL';
    const info = parseDatabaseUrl(rawUrl);

    if (!info.valid) {
        return error(name, 'DATABASE_URL is set but is not a valid URL.', {}, { code: 'DB_URL_INVALID' });
    }

    const details = { url: info.masked, host: info.host || null, port: info.port || null };

    if (!info.host) {
        return success(name, `DATABASE_URL (${info.masked}) uses a local socket or file; network check skipped.`, details);
    }

    if (!info.port) {
        return warning(name, `DATABASE_URL uses ${info.protocol}// without a port, so it could not be checked.`, details, { code: 'DB_URL_NO_PORT' });
    }

    const result = await probe(info.host, info.port, 3000);

    if (result.open) {
        return success(name, `DATABASE_URL host ${info.host}:${info.port} is reachable (credentials not tested).`, details);
    }

    details.reason = result.reason;
    return error(name, `DATABASE_URL points to ${info.host}:${info.port}, but it could not be reached (${result.reason}).`,
        details, { code: 'DB_URL_UNREACHABLE' });
}

async function run(context = {}) {
    const cwd = context.cwd || process.cwd();
    const env = context.env || process.env;
    const exec = context.exec || runCommand;
    const identify = context.identifyProcesses || identifyProcesses;
    const probe = context.tcpProbe || tcpProbe;

    const [pkg, dotenv] = await Promise.all([
        readPackageJson(cwd),
        readEnvFile(path.join(cwd, '.env'))
    ]);

    const dependencies = declaredDependencies(pkg.data);
    const rawUrl = env.DATABASE_URL || dotenv.vars.get('DATABASE_URL') || '';
    const urlInfo = rawUrl ? parseDatabaseUrl(rawUrl) : null;

    const results = await Promise.all(ENGINES.map((engine) => {
        const required = engine.packages.some((p) => dependencies.includes(p))
            || Boolean(urlInfo && urlInfo.valid && engine.protocols.includes(urlInfo.protocol));
        return checkEngine(engine, { required, exec, identify, probe });
    }));

    if (rawUrl) {
        results.push(await checkDatabaseUrl(rawUrl, { probe }));
    }

    return results;
}

module.exports = { run, parseDatabaseUrl, checkEngine, checkDatabaseUrl, ENGINES };
