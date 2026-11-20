const test = require('node:test');
const assert = require('node:assert/strict');
const { identifyProcesses, parseLsofOutput } = require('../src/diagnostics/process');
const { runCommand } = require('../src/utils/exec');
const { fakeExec, missingCommand, listen } = require('./helpers');

const POSTGRES_OUTPUT = 'p891\ncpostgres\nf7\nn[::1]:5432\nf8\nn127.0.0.1:5432\n';

test('parseLsofOutput lists each process once with all its addresses', () => {
    assert.deepEqual(parseLsofOutput(POSTGRES_OUTPUT), [
        { pid: 891, name: 'postgres', addresses: ['[::1]:5432', '127.0.0.1:5432'] }
    ]);
});

test('parseLsofOutput handles several processes on one port', () => {
    const output = 'p100\ncnginx\nf6\nn*:8080\np101\ncnginx\nf6\nn*:8080\n';
    const processes = parseLsofOutput(output);
    assert.deepEqual(processes.map((p) => p.pid), [100, 101]);
});

test('parseLsofOutput ignores garbage and empty output', () => {
    assert.deepEqual(parseLsofOutput(''), []);
    assert.deepEqual(parseLsofOutput('pnotanumber\ncfoo\n'), []);
});

test('identifyProcesses calls lsof safely with an argument array', async () => {
    const exec = fakeExec(() => ({ ok: true, stdout: POSTGRES_OUTPUT }));
    const result = await identifyProcesses(5432, { platform: 'darwin', exec });

    assert.equal(exec.calls[0].command, 'lsof');
    assert.deepEqual(exec.calls[0].args, ['-nP', '-iTCP:5432', '-sTCP:LISTEN', '-Fpcn']);
    assert.equal(result.processes[0].name, 'postgres');
    assert.equal(result.code, null);
});

test('identifyProcesses reports a missing lsof', async () => {
    const result = await identifyProcesses(3000, { platform: 'darwin', exec: missingCommand });
    assert.deepEqual(result.processes, []);
    assert.equal(result.code, 'LSOF_MISSING');
});

test('identifyProcesses explains an empty lsof result (other user or exited process)', async () => {
    const result = await identifyProcesses(3000, { platform: 'darwin', exec: fakeExec(() => ({ exitCode: 1 })) });
    assert.equal(result.code, 'PROCESS_NOT_FOUND');
    assert.match(result.reason, /another user|exited/);
});

test('identifyProcesses reports permission errors', async () => {
    const exec = fakeExec(() => ({ exitCode: 1, stderr: 'lsof: WARNING: can\'t stat() ...: Permission denied' }));
    const result = await identifyProcesses(3000, { platform: 'darwin', exec });
    assert.equal(result.code, 'PERMISSION_DENIED');
});

test('identifyProcesses keeps partial output when lsof exits with 1', async () => {
    const exec = fakeExec(() => ({ exitCode: 1, stdout: 'p55\ncnode\nn*:3000\n' }));
    const result = await identifyProcesses(3000, { platform: 'darwin', exec });
    assert.deepEqual(result.processes.map((p) => p.pid), [55]);
});

test('identifyProcesses does not run anything for invalid ports', async () => {
    const exec = fakeExec(() => ({ ok: true }));
    const result = await identifyProcesses(0, { platform: 'darwin', exec });
    assert.equal(result.code, 'INVALID_PORT');
    assert.equal(exec.calls.length, 0);
});

test('identifyProcesses reports unsupported platforms', async () => {
    const result = await identifyProcesses(3000, { platform: 'win32', exec: missingCommand });
    assert.equal(result.supported, false);
    assert.equal(result.code, 'UNSUPPORTED_PLATFORM');
});

test('identifyProcesses finds this test process with the real lsof', async (t) => {
    const probe = await runCommand('lsof', ['-v']);
    if (probe.errorCode === 'ENOENT' || !['darwin', 'linux'].includes(process.platform)) {
        t.skip('lsof is not available');
        return;
    }

    const port = await listen(t);
    const result = await identifyProcesses(port);
    assert.ok(result.processes.some((p) => p.pid === process.pid), `expected PID ${process.pid} in ${JSON.stringify(result)}`);
});
