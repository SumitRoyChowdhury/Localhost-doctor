class ArgumentError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ArgumentError';
    }
}

function splitList(value) {
    return value.split(',').map((item) => item.trim()).filter((item) => item !== '');
}

function parsePortList(value) {
    const items = splitList(value);
    if (items.length === 0) {
        throw new ArgumentError('--ports needs at least one port, for example: --ports 3000,5432');
    }

    const ports = [];
    for (const item of items) {
        const port = /^\d+$/.test(item) ? Number(item) : NaN;
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
            throw new ArgumentError(`Invalid port "${item}". Ports must be whole numbers between 1 and 65535.`);
        }
        if (!ports.includes(port)) ports.push(port);
    }
    return ports;
}

function parseCheckList(value, validChecks) {
    const items = splitList(value);
    if (items.length === 0) {
        throw new ArgumentError(`--checks needs at least one check. Available checks: ${validChecks.join(', ')}`);
    }

    const checks = [];
    for (const item of items) {
        const id = item.toLowerCase();
        if (!validChecks.includes(id)) {
            throw new ArgumentError(`Unknown check "${item}". Available checks: ${validChecks.join(', ')}`);
        }
        if (!checks.includes(id)) checks.push(id);
    }
    return checks;
}

const FLAGS = {
    '-h': 'help',
    '--help': 'help',
    '-v': 'version',
    '--version': 'version',
    '--verbose': 'verbose',
    '--json': 'json'
};

const VALUE_OPTIONS = {
    '-p': 'ports',
    '--ports': 'ports',
    '-c': 'checks',
    '--checks': 'checks'
};

function parseArguments(argv, { validChecks = [] } = {}) {
    const options = { help: false, version: false, verbose: false, json: false, ports: null, checks: null };

    for (let i = 0; i < argv.length; i++) {
        let arg = argv[i];
        let inlineValue;

        if (arg.startsWith('--') && arg.includes('=')) {
            inlineValue = arg.slice(arg.indexOf('=') + 1);
            arg = arg.slice(0, arg.indexOf('='));
        }

        if (FLAGS[arg]) {
            if (inlineValue !== undefined) throw new ArgumentError(`${arg} does not take a value.`);
            options[FLAGS[arg]] = true;
            continue;
        }

        if (VALUE_OPTIONS[arg]) {
            let value = inlineValue;
            if (value === undefined) {
                const next = argv[i + 1];
                if (next === undefined || next.startsWith('-')) {
                    const example = VALUE_OPTIONS[arg] === 'ports' ? '3000,5432' : validChecks.slice(0, 2).join(',');
                    throw new ArgumentError(`${arg} needs a value, for example: ${arg} ${example}`);
                }
                value = next;
                i += 1;
            }

            options[VALUE_OPTIONS[arg]] = VALUE_OPTIONS[arg] === 'ports'
                ? parsePortList(value)
                : parseCheckList(value, validChecks);
            continue;
        }

        if (arg.startsWith('-')) {
            throw new ArgumentError(`Unknown option: ${arg}`);
        }

        throw new ArgumentError(`Unexpected argument: ${arg}`);
    }

    return options;
}

module.exports = { parseArguments, ArgumentError };
