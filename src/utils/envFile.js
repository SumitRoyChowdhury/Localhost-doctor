const fs = require('node:fs/promises');

function parseEnv(content) {
    const vars = new Map();

    for (const rawLine of content.split(/\r?\n/)) {
        let line = rawLine.trim();

        if (line === '' || line.startsWith('#')) continue;
        if (line.startsWith('export ')) line = line.slice('export '.length).trim();

        const equals = line.indexOf('=');
        if (equals <= 0) continue;

        const key = line.slice(0, equals).trim();
        if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(key)) continue;

        let value = line.slice(equals + 1).trim();
        const quote = value[0];

        if (quote === '"' || quote === "'" || quote === '`') {
            const end = value.indexOf(quote, 1);
            value = end === -1 ? value.slice(1) : value.slice(1, end);
        } else {
            const comment = value.search(/\s#/);
            if (comment !== -1) value = value.slice(0, comment).trim();
        }

        vars.set(key, value);
    }

    return vars;
}

async function readEnvFile(filePath) {
    try {
        const content = await fs.readFile(filePath, 'utf8');
        return { exists: true, vars: parseEnv(content), error: null };
    } catch (err) {
        if (err.code === 'ENOENT') {
            return { exists: false, vars: new Map(), error: null };
        }
        return { exists: true, vars: new Map(), error: err.code || err.message };
    }
}

module.exports = { parseEnv, readEnvFile };
