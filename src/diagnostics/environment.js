const path = require('node:path');
const { success, warning, error } = require('../utils/diagnosticResult');
const { readEnvFile } = require('../utils/envFile');
const { runCommand } = require('../utils/exec');

function list(names, max = 8) {
    const shown = names.slice(0, max).join(', ');
    return names.length > max ? `${shown} (+${names.length - max} more)` : shown;
}

function plural(count, word) {
    return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function checkEnvFile(envFile, example) {
    const name = '.env file';

    if (envFile.error) {
        return error(name, `.env exists but could not be read (${envFile.error}).`, {}, { code: 'ENV_FILE_UNREADABLE' });
    }

    if (envFile.exists) {
        return success(name, `.env found with ${plural(envFile.vars.size, 'variable')}.`, { variableCount: envFile.vars.size });
    }

    if (example.exists) {
        return warning(name, '.env is missing, but .env.example exists.', {}, { code: 'ENV_FILE_MISSING' });
    }

    return success(name, 'No .env or .env.example file in this folder; nothing to validate.', {});
}

function checkRequiredVariables(envFile, example, env) {
    const name = 'Required variables';
    const required = [...example.vars.keys()];
    const missing = [];
    const empty = [];

    for (const key of required) {
        const fromFile = envFile.vars.get(key);
        const fromShell = env[key];

        if ((fromFile !== undefined && fromFile !== '') || (fromShell !== undefined && fromShell !== '')) continue;

        if (fromFile !== undefined || fromShell !== undefined) empty.push(key);
        else missing.push(key);
    }

    const details = { required: required.length, missing, empty };

    if (missing.length > 0) {
        return error(name, `${plural(missing.length, 'required variable')} from .env.example ${missing.length === 1 ? 'is' : 'are'} not set: ${list(missing)}.`,
            details, { code: 'ENV_REQUIRED_MISSING' });
    }

    if (empty.length > 0) {
        return warning(name, `${plural(empty.length, 'variable')} ${empty.length === 1 ? 'is' : 'are'} defined but empty: ${list(empty)}.`,
            details, { code: 'ENV_EMPTY' });
    }

    return success(name, `All ${plural(required.length, 'variable')} listed in .env.example ${required.length === 1 ? 'is' : 'are'} set.`, details);
}

async function checkEnvIgnored(cwd, exec) {
    const result = await exec('git', ['check-ignore', '-q', '.env'], { cwd, timeout: 3000 });

    if (result.ok) {
        return success('.env in git', '.env is ignored by git.', {});
    }

    if (result.exitCode === 1) {
        return warning('.env in git', '.env is not ignored by git, so its secrets could be committed.', {}, { code: 'ENV_NOT_IGNORED' });
    }

    return null;
}

async function run(context = {}) {
    const cwd = context.cwd || process.cwd();
    const env = context.env || process.env;
    const exec = context.exec || runCommand;

    const [envFile, example] = await Promise.all([
        readEnvFile(path.join(cwd, '.env')),
        readEnvFile(path.join(cwd, '.env.example'))
    ]);

    const results = [checkEnvFile(envFile, example)];

    if (example.exists && example.vars.size > 0) {
        results.push(checkRequiredVariables(envFile, example, env));
    }

    if (envFile.exists && !envFile.error) {
        const ignored = await checkEnvIgnored(cwd, exec);
        if (ignored) results.push(ignored);
    }

    return results;
}

module.exports = { run };
