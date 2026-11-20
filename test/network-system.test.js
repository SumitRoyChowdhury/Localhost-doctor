const test = require('node:test');
const assert = require('node:assert/strict');
const network = require('../src/diagnostics/network');
const system = require('../src/diagnostics/system');
const { fakeExec, missingCommand } = require('./helpers');

const goodLookup = async (host, options) => (host === 'localhost'
    ? [{ address: '127.0.0.1', family: 4 }, { address: '::1', family: 6 }]
    : (options && options.all ? [{ address: '104.16.0.1', family: 4 }] : { address: '104.16.0.1', family: 4 }));
const openProbe = async (host, port) => ({ host, port, open: true, reason: 'CONNECTED' });
const closedProbe = async (host, port) => ({ host, port, open: false, reason: 'ETIMEDOUT' });

test('network: everything working', async () => {
    const results = await network.run({ dnsLookup: goodLookup, tcpProbe: openProbe, env: {} });
    assert.deepEqual(results.map((r) => r.name), ['localhost', 'DNS', 'Internet']);
    assert.ok(results.every((r) => r.status === 'success'));
});

test('network: DNS failure skips the internet check', async () => {
    const lookup = async (host, options) => {
        if (host === 'localhost') return goodLookup(host, options);
        const err = new Error('getaddrinfo ENOTFOUND');
        err.code = 'ENOTFOUND';
        throw err;
    };

    const [, dns, internet] = await network.run({ dnsLookup: lookup, tcpProbe: openProbe, env: {} });
    assert.equal(dns.code, 'DNS_FAILED');
    assert.match(dns.message, /ENOTFOUND/);
    assert.equal(internet.code, 'INTERNET_UNREACHABLE');
    assert.match(internet.message, /Skipped/);
});

test('network: unreachable internet notes a configured proxy without printing it', async () => {
    const results = await network.run({ dnsLookup: goodLookup, tcpProbe: closedProbe, env: { HTTPS_PROXY: 'http://user:pw@proxy:8080' } });
    const internet = results[2];

    assert.equal(internet.code, 'INTERNET_UNREACHABLE');
    assert.equal(internet.details.proxyConfigured, true);
    assert.equal(JSON.stringify(results).includes('pw@proxy'), false);
});

test('network: localhost pointing elsewhere is an error', async () => {
    const lookup = async (host, options) => (host === 'localhost' ? [{ address: '10.0.0.5', family: 4 }] : goodLookup(host, options));
    const [localhost] = await network.run({ dnsLookup: lookup, tcpProbe: openProbe, env: {} });
    assert.equal(localhost.code, 'LOCALHOST_RESOLUTION');
});

test('network: a hanging DNS lookup times out', async () => {
    const timers = [];
    const hang = () => new Promise((resolve) => timers.push(setTimeout(resolve, 5000)));
    const results = await network.run({ dnsLookup: hang, tcpProbe: openProbe, env: {}, networkTimeout: 50 });
    timers.forEach(clearTimeout);

    assert.equal(results[0].status, 'error');
    assert.match(results[1].message, /ETIMEDOUT/);
});

test('system: returns informational results for this machine', async () => {
    const results = await system.run({ exec: missingCommand });
    assert.deepEqual(results.map((r) => r.name), ['Operating system', 'Architecture', 'Node.js platform', 'Memory', 'CPU']);
    assert.ok(results.every((r) => r.status === 'success'));
});

test('system: detects Node.js running under Rosetta', async () => {
    const exec = fakeExec((command) => (command === 'sysctl' ? { ok: true, stdout: '1\n' } : { ok: true, stdout: '15.0\n' }));
    const results = await system.run({ platform: 'darwin', arch: 'x64', exec });

    assert.equal(results[0].message, 'macOS 15.0.');
    assert.equal(results[1].code, 'ROSETTA');
});
