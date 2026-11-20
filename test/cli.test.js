const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { run } = require('../src/cli');
const { DiagnosticEngine } = require('../src/core/diagnosticEngine');
const { success, error } = require('../src/utils/diagnosticResult');
const { version } = require('../package.json');
const { captureStream, listen } = require('./helpers');

const ENTRY = path.join(__dirname, '..', 'src', 'index.js');

function cli(args) {
    return new Promise((resolve) => {
        execFile(process.execPath, [ENTRY, ...args], { env: { ...process.env, NO_COLOR: '1' } }, (err, stdout, stderr) => {
            resolve({ code: err ? err.code : 0, stdout, stderr });
        });
    });
}

async function runWith(argv, engine) {
    const stdout = captureStream();
    const stderr = captureStream();
    const code = await run({ argv, stdout, stderr, env: {}, cwd: process.cwd(), engine });
    return { code, stdout: stdout.output, stderr: stderr.output };
}

function engineWith(results) {
    const engine = new DiagnosticEngine();
    engine.register('fake', { title: 'Fake', run: async () => results });
    return engine;
}

test('--help prints usage and exits 0', async () => {
    const { code, stdout } = await cli(['--help']);
    assert.equal(code, 0);
    assert.match(stdout, /Usage:\s+localhost-doctor \[options\]/);
    assert.match(stdout, /--ports/);
});

test('--version prints the package version', async () => {
    const { code, stdout } = await cli(['--version']);
    assert.equal(code, 0);
    assert.equal(stdout.trim(), version);
});

test('invalid arguments exit with code 2 and a helpful message on stderr', async () => {
    const unknown = await cli(['--bogus']);
    assert.equal(unknown.code, 2);
    assert.match(unknown.stderr, /Unknown option: --bogus/);
    assert.match(unknown.stderr, /--help/);
    assert.equal(unknown.stdout, '');

    const badPort = await cli(['--ports', 'abc']);
    assert.equal(badPort.code, 2);
    assert.match(badPort.stderr, /Invalid port "abc"/);
});

test('--json prints valid JSON for the selected checks only', async () => {
    const { code, stdout } = await cli(['--json', '--checks', 'system']);
    const report = JSON.parse(stdout);

    assert.equal(code, 0);
    assert.deepEqual(report.sections.map((s) => s.id), ['system']);
    assert.equal(report.version, version);
});

test('end to end: finds this process listening on a port', async (t) => {
    const port = await listen(t);
    const { stdout } = await cli(['--json', '--checks', 'ports', '--ports', String(port)]);
    const result = JSON.parse(stdout).sections[0].results[0];

    assert.equal(result.status, 'warning');
    assert.equal(result.details.available, false);
    if (['darwin', 'linux'].includes(process.platform)) {
        assert.ok(result.details.processes.some((p) => p.pid === process.pid));
    }
});

test('exit code is 1 when any check reports an error, 0 for warnings only', async () => {
    const failing = await runWith([], engineWith([success('a', 'ok'), error('b', 'broken', {}, { code: 'NPM_MISSING' })]));
    assert.equal(failing.code, 1);
    assert.match(failing.stdout, /✖ b/);
    assert.match(failing.stdout, /Install Node\.js/);

    const passing = await runWith([], engineWith([success('a', 'ok')]));
    assert.equal(passing.code, 0);
});

test('--verbose writes debug logs to stderr, keeping --json output clean', async () => {
    const { code, stdout, stderr } = await cli(['--json', '--verbose', '--checks', 'system']);
    assert.equal(code, 0);
    assert.doesNotThrow(() => JSON.parse(stdout));
    assert.match(stderr, /\[debug\] running system/);
});
