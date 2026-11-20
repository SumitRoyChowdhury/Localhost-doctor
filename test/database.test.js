const test = require('node:test');
const assert = require('node:assert/strict');
const database = require('../src/diagnostics/database');
const { makeProject, listen, missingCommand } = require('./helpers');

const postgres = database.ENGINES.find((e) => e.id === 'postgres');

const closedProbe = async (host, port) => ({ host, port, open: false, reason: 'ECONNREFUSED' });
const openProbe = async (host, port) => ({ host, port, open: true, reason: 'CONNECTED' });
const owner = (name) => async (port) => ({ port, supported: true, processes: [{ pid: 9, name, addresses: [] }] });

test('parseDatabaseUrl hides the password and query string', () => {
    const info = database.parseDatabaseUrl('postgres://admin:hunter2@db.internal:6543/app?sslpassword=xyz');
    assert.equal(info.valid, true);
    assert.equal(info.host, 'db.internal');
    assert.equal(info.port, 6543);
    assert.equal(info.masked, 'postgres://admin:****@db.internal:6543/app');
    assert.equal(info.masked.includes('hunter2'), false);
    assert.equal(info.masked.includes('xyz'), false);
});

test('parseDatabaseUrl uses default ports and rejects garbage', () => {
    assert.equal(database.parseDatabaseUrl('mysql://localhost/app').port, 3306);
    assert.equal(database.parseDatabaseUrl('not a url').valid, false);
});

test('database not running and not needed is fine', async () => {
    const result = await database.checkEngine(postgres, { required: false, exec: missingCommand, identify: owner('postgres'), probe: closedProbe });
    assert.equal(result.status, 'success');
    assert.match(result.message, /not running/);
});

test('database not running but needed by the project is an error', async () => {
    const result = await database.checkEngine(postgres, { required: true, exec: missingCommand, identify: owner('postgres'), probe: closedProbe });
    assert.equal(result.code, 'DB_NOT_RUNNING');
});

test('database running is a success', async () => {
    const result = await database.checkEngine(postgres, { required: true, exec: missingCommand, identify: owner('postgres'), probe: openProbe });
    assert.equal(result.status, 'success');
    assert.match(result.message, /accepting connections/);
});

test('database running in Docker is recognised', async () => {
    const result = await database.checkEngine(postgres, { required: true, exec: missingCommand, identify: owner('com.docker.backend'), probe: openProbe });
    assert.equal(result.status, 'success');
    assert.match(result.message, /container/);
});

test('another program on the database port is a conflict', async () => {
    const result = await database.checkEngine(postgres, { required: false, exec: missingCommand, identify: owner('node'), probe: openProbe });
    assert.equal(result.code, 'DB_PORT_CONFLICT');
});

test('DATABASE_URL from .env is checked without leaking the password', async (t) => {
    const port = await listen(t);
    const cwd = await makeProject(t, {
        '.env': `DATABASE_URL=postgres://user:topsecret@127.0.0.1:${port}/app\n`
    });

    const results = await database.run({ cwd, env: {}, exec: missingCommand, identifyProcesses: owner('postgres'), tcpProbe: undefined });
    const urlResult = results.find((r) => r.name === 'DATABASE_URL');

    assert.equal(urlResult.status, 'success');
    assert.equal(JSON.stringify(results).includes('topsecret'), false);
    assert.equal(results.find((r) => r.name === 'PostgreSQL').details.requiredByProject, true);
});

test('unreachable or invalid DATABASE_URL is an error', async (t) => {
    const cwd = await makeProject(t);

    const unreachable = await database.run({ cwd, env: { DATABASE_URL: 'postgres://localhost:5999/x' }, exec: missingCommand, tcpProbe: closedProbe });
    assert.equal(unreachable.find((r) => r.name === 'DATABASE_URL').code, 'DB_URL_UNREACHABLE');

    const invalid = await database.run({ cwd, env: { DATABASE_URL: '::::' }, exec: missingCommand, tcpProbe: closedProbe });
    assert.equal(invalid.find((r) => r.name === 'DATABASE_URL').code, 'DB_URL_INVALID');
});

test('a pg dependency in package.json makes PostgreSQL required', async (t) => {
    const cwd = await makeProject(t, { 'package.json': JSON.stringify({ dependencies: { pg: '^8' } }) });
    const results = await database.run({ cwd, env: {}, exec: missingCommand, tcpProbe: closedProbe });
    assert.equal(results.find((r) => r.name === 'PostgreSQL').code, 'DB_NOT_RUNNING');
    assert.equal(results.find((r) => r.name === 'MySQL').status, 'success');
});
