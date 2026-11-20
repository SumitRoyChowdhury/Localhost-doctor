const dns = require('node:dns');
const { success, error } = require('../utils/diagnosticResult');
const { tcpProbe } = require('../utils/tcp');
const { withTimeout } = require('../utils/timeout');

const REMOTE_HOST = 'registry.npmjs.org';

function isLoopback(address) {
    return address === '::1' || address.startsWith('127.');
}

function hasProxy(env) {
    return ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy'].some((key) => Boolean(env[key]));
}

async function checkLocalhost(lookup, timeout) {
    const name = 'localhost';

    try {
        const records = await withTimeout(lookup('localhost', { all: true }), timeout);
        const addresses = records.map((r) => r.address);

        if (!addresses.some(isLoopback)) {
            return error(name, `localhost resolves to ${addresses.join(', ')} instead of this machine.`,
                { addresses }, { code: 'LOCALHOST_RESOLUTION' });
        }

        return success(name, `localhost resolves to ${addresses.join(', ')}.`, { addresses });
    } catch (err) {
        return error(name, `localhost could not be resolved (${err.code || err.message}).`, {}, { code: 'LOCALHOST_RESOLUTION' });
    }
}

async function checkDns(lookup, timeout) {
    const name = 'DNS';

    try {
        const { address } = await withTimeout(lookup(REMOTE_HOST), timeout);
        return success(name, `DNS is working (${REMOTE_HOST} → ${address}).`, { host: REMOTE_HOST, address });
    } catch (err) {
        return error(name, `DNS lookup for ${REMOTE_HOST} failed (${err.code || err.message}).`,
            { host: REMOTE_HOST }, { code: 'DNS_FAILED' });
    }
}

async function checkInternet(probe, timeout, env) {
    const name = 'Internet';
    const started = Date.now();
    const result = await probe(REMOTE_HOST, 443, timeout);
    const details = { host: REMOTE_HOST, port: 443, proxyConfigured: hasProxy(env) };

    if (result.open) {
        details.latencyMs = Date.now() - started;
        return success(name, `Connected to ${REMOTE_HOST}:443 in ${details.latencyMs} ms.`, details);
    }

    details.reason = result.reason;
    return error(name, `Could not connect to ${REMOTE_HOST}:443 (${result.reason}).`, details, { code: 'INTERNET_UNREACHABLE' });
}

async function run(context = {}) {
    const lookup = context.dnsLookup || dns.promises.lookup;
    const probe = context.tcpProbe || tcpProbe;
    const env = context.env || process.env;
    const timeout = context.networkTimeout || 3000;

    const [localhost, dnsResult] = await Promise.all([
        checkLocalhost(lookup, timeout),
        checkDns(lookup, timeout)
    ]);

    const internet = dnsResult.status === 'success'
        ? await checkInternet(probe, timeout, env)
        : error('Internet', 'Skipped because DNS is not working.', { host: REMOTE_HOST }, { code: 'INTERNET_UNREACHABLE' });

    return [localhost, dnsResult, internet];
}

module.exports = { run, REMOTE_HOST };
