const test = require('node:test');
const assert = require('node:assert/strict');
const { checkPort, diagnosePort, run } = require('../src/diagnostics/ports');
const { listen, freePort } = require('./helpers');

const noProcess = async (port) => ({ port, supported: true, processes: [], code: 'PROCESS_NOT_FOUND', reason: 'nothing visible' });
const nodeProcess = async (port) => ({ port, supported: true, processes: [{ pid: 4242, name: 'node', addresses: [`*:${port}`] }] });

test('detects a server listening on 127.0.0.1', async (t) => {
    const port = await listen(t, '127.0.0.1');
    const result = await checkPort(port);

    assert.equal(result.available, false);
    assert.ok(result.listeningOn.includes('127.0.0.1'));
});

test('detects a server listening on the IPv6 wildcard (the original macOS bug)', async (t) => {
    let port;
    try {
        port = await listen(t, '::');
    } catch {
        t.skip('IPv6 is not available on this machine');
        return;
    }

    const result = await checkPort(port);
    assert.equal(result.available, false);
});

test('reports a free port as available', async () => {
    const port = await freePort();
    const result = await checkPort(port);
    assert.equal(result.available, true);
    assert.deepEqual(result.listeningOn, []);
});

test('rejects invalid port numbers', async () => {
    for (const bad of [0, -1, 65536, 3.5, NaN, '3000', null]) {
        await assert.rejects(() => checkPort(bad), RangeError, `expected ${bad} to be rejected`);
    }
});

test('reports "unknown" for unexpected socket errors', async () => {
    const probe = async (host, port) => ({ host, port, open: false, reason: 'ETIMEDOUT' });
    const result = await checkPort(3000, { probe });
    assert.equal(result.available, null);
    assert.equal(result.problems.length, 2);
});

test('ignores loopback addresses that do not exist (IPv6 disabled)', async () => {
    const probe = async (host, port) => ({ host, port, open: false, reason: host === '::1' ? 'EADDRNOTAVAIL' : 'ECONNREFUSED' });
    const result = await checkPort(3000, { probe });
    assert.equal(result.available, true);
});

test('diagnosePort: free port is a success', async () => {
    const port = await freePort();
    const result = await diagnosePort(port, { identify: noProcess });
    assert.equal(result.status, 'success');
    assert.equal(result.name, `Port ${port}`);
    assert.deepEqual(result.details, { port, available: true });
});

test('diagnosePort: occupied port is a warning with process details', async (t) => {
    const port = await listen(t);
    const result = await diagnosePort(port, { identify: nodeProcess });

    assert.equal(result.status, 'warning');
    assert.equal(result.code, 'PORT_IN_USE');
    assert.match(result.message, /node \(PID 4242\)/);
    assert.equal(result.details.processes[0].pid, 4242);
});

test('diagnosePort: occupied port with unknown owner explains why', async (t) => {
    const port = await listen(t);
    const result = await diagnosePort(port, { identify: noProcess });

    assert.equal(result.status, 'warning');
    assert.match(result.message, /could not be identified/);
    assert.equal(result.details.lookupProblem, 'PROCESS_NOT_FOUND');
});

test('diagnosePort: server on a non-loopback address is caught by lsof', async () => {
    const port = await freePort();
    const result = await diagnosePort(port, { identify: nodeProcess });
    assert.equal(result.status, 'warning');
    assert.match(result.message, /non-loopback/);
});

test('diagnosePort: invalid port is an error, not a crash', async () => {
    const result = await diagnosePort(70000);
    assert.equal(result.status, 'error');
    assert.equal(result.code, 'INVALID_PORT');
});

test('run checks every requested port', async (t) => {
    const busy = await listen(t);
    const free = await freePort();
    const results = await run({ ports: [busy, free], identifyProcesses: noProcess });

    assert.deepEqual(results.map((r) => r.status), ['warning', 'success']);
});
