const test = require('node:test');
const assert = require('node:assert/strict');
const runtime = require('../src/diagnostics/runtime');
const { runCommand } = require('../src/utils/exec');
const { fakeExec, missingCommand } = require('./helpers');

test('checkNode reports the running Node.js version', () => {
    const result = runtime.checkNode();
    assert.equal(result.status, 'success');
    assert.equal(result.details.version, process.version);
});

test('checkNpm reports the version when npm works', async () => {
    const exec = fakeExec(() => ({ ok: true, stdout: '10.2.0\n' }));
    const result = await runtime.checkNpm({ exec });

    assert.equal(result.status, 'success');
    assert.equal(result.details.version, '10.2.0');
    assert.deepEqual(exec.calls[0].args, ['--version']);
});

test('checkNpm reports NPM_MISSING when npm is not on PATH', async () => {
    const result = await runtime.checkNpm({ exec: missingCommand });
    assert.equal(result.status, 'error');
    assert.equal(result.code, 'NPM_MISSING');
});

test('checkNpm reports permission problems', async () => {
    const result = await runtime.checkNpm({ exec: fakeExec(() => ({ errorCode: 'EACCES' })) });
    assert.equal(result.code, 'NPM_NOT_EXECUTABLE');
});

test('checkNpm reports the real reason when npm crashes', async () => {
    const exec = fakeExec(() => ({ exitCode: 1, stderr: 'npm ERR! cannot find module semver\nmore lines' }));
    const result = await runtime.checkNpm({ exec });

    assert.equal(result.code, 'NPM_FAILED');
    assert.match(result.message, /cannot find module semver/);
    assert.equal(result.details.exitCode, 1);
});

test('checkNpm handles a hanging npm', async () => {
    const result = await runtime.checkNpm({ exec: fakeExec(() => ({ timedOut: true })) });
    assert.equal(result.code, 'NPM_FAILED');
    assert.match(result.message, /did not respond/);
});

test('run returns Node.js and npm results', async () => {
    const results = await runtime.run({ exec: missingCommand });
    assert.deepEqual(results.map((r) => r.name), ['Node.js', 'npm']);
});

test('runCommand reports ENOENT for a program that does not exist', async () => {
    const result = await runCommand('localhost-doctor-no-such-command-xyz', []);
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'ENOENT');
});

test('runCommand returns stdout and exit codes of real programs', async () => {
    const ok = await runCommand(process.execPath, ['-e', 'process.stdout.write("hi")']);
    assert.equal(ok.ok, true);
    assert.equal(ok.stdout, 'hi');

    const failed = await runCommand(process.execPath, ['-e', 'process.exit(3)']);
    assert.equal(failed.ok, false);
    assert.equal(failed.exitCode, 3);
});
