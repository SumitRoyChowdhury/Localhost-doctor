const { success, error } = require('../utils/diagnosticResult');
const { runCommand } = require('../utils/exec');

function firstLine(text) {
    return String(text || '').trim().split('\n')[0];
}

function checkNode({ version = process.version, execPath = process.execPath } = {}) {
    return success('Node.js', `Node.js ${version} is running.`, { version, execPath });
}

async function checkNpm({ exec = runCommand } = {}) {
    const result = await exec('npm', ['--version'], { timeout: 10000 });

    if (result.ok) {
        const version = result.stdout.trim();
        return success('npm', `npm ${version} is installed.`, { version });
    }

    if (result.errorCode === 'ENOENT') {
        return error('npm', 'npm was not found on your PATH.', {}, { code: 'NPM_MISSING' });
    }

    if (result.errorCode === 'EACCES') {
        return error('npm', 'npm was found but could not be executed (permission denied).', {}, { code: 'NPM_NOT_EXECUTABLE' });
    }

    if (result.timedOut) {
        return error('npm', '`npm --version` did not respond within 10 seconds.', {}, { code: 'NPM_FAILED' });
    }

    const reason = firstLine(result.stderr) || firstLine(result.message) || 'unknown error';
    return error('npm', `npm is installed but failed to run: ${reason}`, { exitCode: result.exitCode }, { code: 'NPM_FAILED' });
}

async function run(context = {}) {
    return [checkNode(), await checkNpm(context)];
}

module.exports = { run, checkNode, checkNpm };
