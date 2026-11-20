const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const dependencies = require('../src/diagnostics/dependencies');
const { makeProject } = require('./helpers');

const pkg = (deps = {}, devDeps = {}) => JSON.stringify({ name: 'demo', version: '1.0.0', dependencies: deps, devDependencies: devDeps });
const installed = (name) => ({ [`node_modules/${name}/package.json`]: '{}' });

test('folder without package.json gives a warning', async (t) => {
    const cwd = await makeProject(t);
    const [result] = await dependencies.run({ cwd });
    assert.equal(result.code, 'NO_PACKAGE_JSON');
});

test('broken package.json is an error', async (t) => {
    const cwd = await makeProject(t, { 'package.json': '{ "name": ' });
    const [result] = await dependencies.run({ cwd });
    assert.equal(result.code, 'PACKAGE_JSON_INVALID');
});

test('no dependencies declared is fine', async (t) => {
    const cwd = await makeProject(t, { 'package.json': pkg() });
    const results = await dependencies.run({ cwd });
    assert.ok(results.every((r) => r.status === 'success'));
});

test('missing node_modules is reported', async (t) => {
    const cwd = await makeProject(t, { 'package.json': pkg({ express: '^4' }), 'package-lock.json': '{}' });
    const results = await dependencies.run({ cwd });
    assert.equal(results.find((r) => r.name === 'Dependencies').code, 'NODE_MODULES_MISSING');
});

test('lists the dependencies that are not installed', async (t) => {
    const cwd = await makeProject(t, {
        'package.json': pkg({ express: '^4', '@scope/pkg': '1' }, { mocha: '^10' }),
        'package-lock.json': '{}',
        ...installed('express')
    });

    const results = await dependencies.run({ cwd });
    const deps = results.find((r) => r.name === 'Dependencies');

    assert.equal(deps.code, 'DEPENDENCIES_MISSING');
    assert.deepEqual(deps.details.missing, ['@scope/pkg', 'mocha']);
});

test('finds packages hoisted to a parent node_modules (monorepos)', async (t) => {
    const root = await makeProject(t, {
        ...installed('lodash'),
        'packages/app/package.json': pkg({ lodash: '^4' }),
        'packages/app/package-lock.json': '{}'
    });

    const results = await dependencies.run({ cwd: path.join(root, 'packages', 'app') });
    assert.equal(results.find((r) => r.name === 'Dependencies').status, 'success');
});

test('lockfile checks: missing, multiple and present', async (t) => {
    const base = { 'package.json': pkg({ a: '1' }), ...installed('a') };

    const none = await makeProject(t, base);
    assert.equal((await dependencies.run({ cwd: none })).find((r) => r.name === 'Lockfile').code, 'LOCKFILE_MISSING');

    const many = await makeProject(t, { ...base, 'package-lock.json': '{}', 'yarn.lock': '' });
    assert.equal((await dependencies.run({ cwd: many })).find((r) => r.name === 'Lockfile').code, 'LOCKFILES_MULTIPLE');

    const one = await makeProject(t, { ...base, 'pnpm-lock.yaml': '' });
    const lock = (await dependencies.run({ cwd: one })).find((r) => r.name === 'Lockfile');
    assert.equal(lock.status, 'success');
    assert.equal(lock.details.manager, 'pnpm');
});

test('package-lock.json newer than the last install is reported', async (t) => {
    const cwd = await makeProject(t, {
        'package.json': pkg({ a: '1' }),
        ...installed('a'),
        'node_modules/.package-lock.json': '{}',
        'package-lock.json': '{}'
    });

    const old = new Date(Date.now() - 60_000);
    await fs.utimes(path.join(cwd, 'node_modules', '.package-lock.json'), old, old);

    const lock = (await dependencies.run({ cwd })).find((r) => r.name === 'Lockfile');
    assert.equal(lock.code, 'LOCKFILE_OUT_OF_SYNC');
});
