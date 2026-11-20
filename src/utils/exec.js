const { execFile } = require('node:child_process');

function runCommand(command, args = [], { timeout = 5000, cwd } = {}) {
    return new Promise((resolve) => {
        execFile(command, args, { timeout, cwd, windowsHide: true }, (err, stdout, stderr) => {
            if (!err) {
                resolve({ ok: true, stdout, stderr, exitCode: 0, errorCode: null, timedOut: false });
                return;
            }

            resolve({
                ok: false,
                stdout: stdout || '',
                stderr: stderr || '',
                exitCode: typeof err.code === 'number' ? err.code : null,
                errorCode: typeof err.code === 'string' ? err.code : null,
                timedOut: err.killed === true,
                message: err.message
            });
        });
    });
}

module.exports = { runCommand };
