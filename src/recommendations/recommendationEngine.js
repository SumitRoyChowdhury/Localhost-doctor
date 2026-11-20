function processAdvice(result) {
    const { port, processes = [] } = result.details;

    if (processes.length > 0) {
        const owners = processes.map((p) => `${p.name} (PID ${p.pid})`).join(', ');
        const pids = processes.map((p) => p.pid).join(' ');
        return `Port ${port} is used by ${owners}. If you don't need it, stop it with \`kill ${pids}\`, or start your app on a different port.`;
    }

    return `Run \`sudo lsof -nP -iTCP:${port} -sTCP:LISTEN\` to see which process is using port ${port}.`;
}

const RULES = {
    NPM_MISSING: () => 'Install Node.js (it includes npm) from https://nodejs.org or with a version manager such as nvm.',
    NPM_NOT_EXECUTABLE: () => 'Check the permissions of your npm installation, or reinstall Node.js with a version manager such as nvm.',
    NPM_FAILED: () => 'Run `npm --version` yourself to see the full error. Reinstalling Node.js usually fixes a broken npm.',

    PORT_IN_USE: processAdvice,
    INVALID_PORT: () => 'Use port numbers between 1 and 65535, for example `--ports 3000,8080`.',
    PORT_CHECK_FAILED: (r) => `Port ${r.details.port} could not be checked. Make sure your firewall allows local connections, then try again.`,

    DB_NOT_RUNNING: (r) => r.name === 'PostgreSQL'
        ? 'Start PostgreSQL, for example with `brew services start postgresql` or `docker run -p 5432:5432 -e POSTGRES_PASSWORD=... postgres`.'
        : 'Start MySQL, for example with `brew services start mysql` or `docker run -p 3306:3306 -e MYSQL_ROOT_PASSWORD=... mysql`.',
    DB_PORT_CONFLICT: (r) => `Another program is using the default ${r.name} port. ${processAdvice(r)}`,
    DB_URL_INVALID: () => 'Fix DATABASE_URL so it looks like `postgres://user:password@host:5432/database`.',
    DB_URL_NO_PORT: () => 'Add an explicit port to DATABASE_URL so it can be checked.',
    DB_URL_UNREACHABLE: () => 'Make sure the database in DATABASE_URL is running and that the host and port are correct.',

    ENV_FILE_MISSING: () => 'Create your .env from the template: `cp .env.example .env`, then fill in the values.',
    ENV_FILE_UNREADABLE: () => 'Check the permissions of your .env file.',
    ENV_REQUIRED_MISSING: (r) => `Add these variables to .env: ${r.details.missing.join(', ')}.`,
    ENV_EMPTY: (r) => `Give these variables a value in .env: ${r.details.empty.join(', ')}.`,
    ENV_NOT_IGNORED: () => 'Add `.env` to your .gitignore so secrets are never committed.',

    NO_PACKAGE_JSON: () => 'Run Localhost Doctor inside a Node.js project folder, or create one with `npm init`.',
    PACKAGE_JSON_INVALID: () => 'Fix the JSON syntax in package.json (a missing comma or quote is the usual cause).',
    NODE_MODULES_MISSING: () => 'Install dependencies with `npm install`.',
    DEPENDENCIES_MISSING: () => 'Install the missing dependencies with `npm install`.',
    LOCKFILE_MISSING: () => 'Run `npm install` to create package-lock.json, and commit it.',
    LOCKFILES_MULTIPLE: () => 'Use one package manager and delete the other lockfiles.',
    LOCKFILE_OUT_OF_SYNC: () => 'Run `npm install` so node_modules matches package-lock.json.',

    LOCALHOST_RESOLUTION: () => 'Make sure /etc/hosts contains `127.0.0.1 localhost` and `::1 localhost`.',
    DNS_FAILED: () => 'Check your internet connection and DNS settings (try `nslookup registry.npmjs.org`).',
    INTERNET_UNREACHABLE: (r) => r.details.proxyConfigured
        ? 'A proxy is configured: check that HTTPS_PROXY is correct and the proxy is reachable.'
        : 'Check your internet connection, VPN or firewall settings.',

    ROSETTA: () => 'Install the arm64 build of Node.js (for example with nvm in a native terminal) for better performance.',

    DIAGNOSTIC_CRASHED: () => 'This is a bug in Localhost Doctor. Run with --verbose to see details.',
    DIAGNOSTIC_TIMEOUT: () => 'A check took too long. Run with --verbose to see which one, or skip it with --checks.'
};

function getRecommendations(sections) {
    const recommendations = [];
    const seen = new Set();

    for (const section of sections) {
        for (const result of section.results) {
            if (result.status === 'success' || !result.code || !RULES[result.code]) continue;

            const text = RULES[result.code](result);
            if (seen.has(text)) continue;
            seen.add(text);

            recommendations.push({ check: result.name, status: result.status, code: result.code, text });
        }
    }

    return recommendations.sort((a, b) => (a.status === b.status ? 0 : a.status === 'error' ? -1 : 1));
}

module.exports = { getRecommendations, RULES };
