const fs = require('node:fs/promises');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

async function makeProject(t, files = {}) {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'localhost-doctor-test-'));
    t.after(() => fs.rm(dir, { recursive: true, force: true }));

    for (const [relative, content] of Object.entries(files)) {
        const full = path.join(dir, relative);
        await fs.mkdir(path.dirname(full), { recursive: true });
        await fs.writeFile(full, content);
    }

    return dir;
}

async function listen(t, host = '127.0.0.1') {
    const server = net.createServer((socket) => socket.destroy());
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, host, resolve);
    });
    t.after(() => new Promise((resolve) => server.close(resolve)));
    return server.address().port;
}

async function freePort() {
    const server = net.createServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    await new Promise((resolve) => server.close(resolve));
    return port;
}

function fakeExec(handler) {
    const calls = [];
    const exec = async (command, args, options) => {
        calls.push({ command, args, options });
        const result = (await handler(command, args, options)) || {};
        return {
            ok: false, stdout: '', stderr: '', exitCode: null, errorCode: null, timedOut: false, message: '',
            ...result
        };
    };
    exec.calls = calls;
    return exec;
}

const missingCommand = fakeExec(() => ({ errorCode: 'ENOENT', message: 'spawn ENOENT' }));

function captureStream({ isTTY = false } = {}) {
    let data = '';
    return {
        isTTY,
        write(chunk) { data += chunk; return true; },
        get output() { return data; }
    };
}

module.exports = { makeProject, listen, freePort, fakeExec, missingCommand, captureStream };
