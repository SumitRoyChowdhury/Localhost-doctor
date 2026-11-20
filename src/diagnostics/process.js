const { runCommand } = require('../utils/exec');

function isValidPort(port) {
    return Number.isInteger(port) && port >= 1 && port <= 65535;
}

function parseLsofOutput(stdout) {
    const byPid = new Map();
    let current = null;

    for (const line of String(stdout).split('\n')) {
        if (line.length < 2) continue;

        const field = line[0];
        const value = line.slice(1);

        if (field === 'p') {
            const pid = Number(value);
            if (!Number.isInteger(pid) || pid <= 0) {
                current = null;
                continue;
            }
            current = byPid.get(pid) || { pid, name: 'unknown', addresses: [] };
            byPid.set(pid, current);
        } else if (field === 'c' && current) {
            current.name = value;
        } else if (field === 'n' && current && !current.addresses.includes(value)) {
            current.addresses.push(value);
        }
    }

    return [...byPid.values()];
}

function lookupResult(port, processes, { code = null, reason = null, supported = true } = {}) {
    return { port, supported, processes, code, reason };
}

async function lsofStrategy(port, exec) {
    const result = await exec('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fpcn'], { timeout: 5000 });
    const processes = parseLsofOutput(result.stdout);

    if (processes.length > 0) {
        return lookupResult(port, processes);
    }

    if (result.errorCode === 'ENOENT') {
        return lookupResult(port, [], {
            code: 'LSOF_MISSING',
            reason: 'the `lsof` command is not installed'
        });
    }

    if (result.errorCode === 'EACCES' || /permission denied/i.test(result.stderr)) {
        return lookupResult(port, [], {
            code: 'PERMISSION_DENIED',
            reason: 'permission denied while running `lsof`'
        });
    }

    if (result.timedOut) {
        return lookupResult(port, [], {
            code: 'LOOKUP_FAILED',
            reason: '`lsof` did not respond within 5 seconds'
        });
    }

    if (result.ok || result.exitCode === 1) {
        return lookupResult(port, [], {
            code: 'PROCESS_NOT_FOUND',
            reason: 'no listening process is visible to the current user; it may belong to another user or may have just exited'
        });
    }

    return lookupResult(port, [], {
        code: 'LOOKUP_FAILED',
        reason: `\`lsof\` failed: ${String(result.stderr || result.message).trim().split('\n')[0]}`
    });
}

const STRATEGIES = {
    darwin: lsofStrategy,
    linux: lsofStrategy
};

async function identifyProcesses(port, { platform = process.platform, exec = runCommand } = {}) {
    if (!isValidPort(port)) {
        return lookupResult(port, [], {
            code: 'INVALID_PORT',
            reason: `${port} is not a valid port number`
        });
    }

    const strategy = STRATEGIES[platform];

    if (!strategy) {
        return lookupResult(port, [], {
            supported: false,
            code: 'UNSUPPORTED_PLATFORM',
            reason: `process identification is not supported on ${platform} yet`
        });
    }

    return strategy(port, exec);
}

module.exports = { identifyProcesses, parseLsofOutput, isValidPort };
