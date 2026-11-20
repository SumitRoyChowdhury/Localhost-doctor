const { success, warning, error } = require('../utils/diagnosticResult');
const { tcpProbe } = require('../utils/tcp');
const { identifyProcesses, isValidPort } = require('./process');

const DEFAULT_PORTS = Object.freeze([3000, 5173, 8000, 8080]);
const LOOPBACK_HOSTS = Object.freeze(['127.0.0.1', '::1']);

const NOT_LISTENING = new Set(['ECONNREFUSED']);

const HOST_UNAVAILABLE = new Set(['EADDRNOTAVAIL', 'ENETUNREACH', 'EHOSTUNREACH', 'EAFNOSUPPORT', 'EPROTONOSUPPORT']);

async function checkPort(port, { hosts = LOOPBACK_HOSTS, timeout = 500, probe = tcpProbe } = {}) {
    if (!isValidPort(port)) {
        throw new RangeError(`Invalid port: ${port}. Ports must be whole numbers between 1 and 65535.`);
    }

    const probes = await Promise.all(hosts.map((host) => probe(host, port, timeout)));

    const listeningOn = probes.filter((p) => p.open).map((p) => p.host);
    const refused = probes.some((p) => !p.open && NOT_LISTENING.has(p.reason));
    const problems = probes
        .filter((p) => !p.open && !NOT_LISTENING.has(p.reason) && !HOST_UNAVAILABLE.has(p.reason))
        .map((p) => `${p.host}: ${p.reason}`);

    let available;
    if (listeningOn.length > 0) available = false;
    else if (problems.length > 0) available = null;
    else if (refused) available = true;
    else available = null;

    return { port, available, listeningOn, problems };
}

function describeProcesses(processes) {
    return processes.map((p) => `${p.name} (PID ${p.pid})`).join(', ');
}

async function diagnosePort(port, { identify = identifyProcesses, probe = tcpProbe } = {}) {
    const name = `Port ${port}`;

    if (!isValidPort(port)) {
        return error(name, `${port} is not a valid port. Ports must be whole numbers between 1 and 65535.`,
            { port }, { code: 'INVALID_PORT' });
    }

    let check;
    try {
        check = await checkPort(port, { probe });
    } catch (err) {
        return error(name, `Could not check port ${port}: ${err.message}`, { port }, { code: 'PORT_CHECK_FAILED' });
    }

    if (check.available === null) {
        return error(name, `Could not determine whether port ${port} is in use (${check.problems.join('; ') || 'no usable loopback address'}).`,
            { port, problems: check.problems }, { code: 'PORT_CHECK_FAILED' });
    }

    const lookup = await identify(port);

    if (check.available && lookup.processes.length === 0) {
        return success(name, `Port ${port} is available.`, { port, available: true });
    }

    const details = {
        port,
        available: false,
        listeningOn: check.listeningOn,
        processes: lookup.processes
    };

    if (lookup.processes.length > 0) {
        const where = check.available ? ' on a non-loopback address' : '';
        return warning(name, `Port ${port} is already occupied by ${describeProcesses(lookup.processes)}${where}.`,
            details, { code: 'PORT_IN_USE' });
    }

    details.lookupProblem = lookup.code;
    return warning(name, `Port ${port} is already occupied, but the owning process could not be identified: ${lookup.reason}.`,
        details, { code: 'PORT_IN_USE' });
}

async function run(context = {}) {
    const ports = context.ports || DEFAULT_PORTS;
    const options = { identify: context.identifyProcesses, probe: context.tcpProbe };
    return Promise.all(ports.map((port) => diagnosePort(port, options)));
}

module.exports = { run, checkPort, diagnosePort, DEFAULT_PORTS };
