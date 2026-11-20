const test = require('node:test');
const assert = require('node:assert/strict');
const environment = require('../src/diagnostics/environment');
const { parseEnv } = require('../src/utils/envFile');
const { makeProject, fakeExec, missingCommand } = require('./helpers');

const SECRET = 'super-secret-value-123';

test('parseEnv supports comments, export, quotes and inline comments', () => {
    const vars = parseEnv([
        '# comment',
        '',
        'PLAIN=value',
        'export EXPORTED=yes',
        'DOUBLE="hello world"',
        "SINGLE='x # not a comment'",
        'INLINE=abc # comment',
        'EMPTY=',
        'not a variable',
        '1BAD=no'
    ].join('\n'));

    assert.deepEqual(Object.fromEntries(vars), {
        PLAIN: 'value',
        EXPORTED: 'yes',
        DOUBLE: 'hello world',
        SINGLE: 'x # not a comment',
        INLINE: 'abc',
        EMPTY: ''
    });
});

test('no .env and no .env.example is fine', async (t) => {
    const cwd = await makeProject(t);
    const results = await environment.run({ cwd, env: {}, exec: missingCommand });
    assert.deepEqual(results.map((r) => r.status), ['success']);
});

test('missing .env with an .env.example is reported', async (t) => {
    const cwd = await makeProject(t, { '.env.example': 'API_KEY=\nPORT=3000\n' });
    const [file, required] = await environment.run({ cwd, env: {}, exec: missingCommand });

    assert.equal(file.code, 'ENV_FILE_MISSING');
    assert.equal(required.code, 'ENV_REQUIRED_MISSING');
    assert.deepEqual(required.details.missing, ['API_KEY', 'PORT']);
});

test('detects empty variables and accepts values from the shell environment', async (t) => {
    const cwd = await makeProject(t, {
        '.env.example': 'API_KEY=\nDB_PASSWORD=\nFROM_SHELL=\n',
        '.env': `API_KEY=${SECRET}\nDB_PASSWORD=\n`
    });

    const results = await environment.run({ cwd, env: { FROM_SHELL: 'set' }, exec: missingCommand });
    const required = results.find((r) => r.name === 'Required variables');

    assert.equal(required.status, 'warning');
    assert.equal(required.code, 'ENV_EMPTY');
    assert.deepEqual(required.details.empty, ['DB_PASSWORD']);
    assert.deepEqual(required.details.missing, []);
});

test('all required variables set is a success', async (t) => {
    const cwd = await makeProject(t, { '.env.example': 'A=\nB=\n', '.env': 'A=1\nB=2\n' });
    const results = await environment.run({ cwd, env: {}, exec: missingCommand });
    assert.ok(results.every((r) => r.status === 'success'));
});

test('never exposes secret values', async (t) => {
    const cwd = await makeProject(t, {
        '.env.example': 'API_KEY=\nOTHER=\n',
        '.env': `API_KEY=${SECRET}\nDATABASE_URL=postgres://u:${SECRET}@localhost/db\n`
    });

    const results = await environment.run({ cwd, env: { SHELL_SECRET: SECRET }, exec: missingCommand });
    assert.equal(JSON.stringify(results).includes(SECRET), false);
});

test('warns when .env is not ignored by git', async (t) => {
    const cwd = await makeProject(t, { '.env': 'A=1\n' });
    const exec = fakeExec(() => ({ exitCode: 1 }));

    const results = await environment.run({ cwd, env: {}, exec });
    const gitResult = results.find((r) => r.name === '.env in git');

    assert.equal(gitResult.code, 'ENV_NOT_IGNORED');
    assert.deepEqual(exec.calls[0].args, ['check-ignore', '-q', '.env']);
    assert.equal(exec.calls[0].options.cwd, cwd);
});

test('skips the git check outside a git repository', async (t) => {
    const cwd = await makeProject(t, { '.env': 'A=1\n' });
    const results = await environment.run({ cwd, env: {}, exec: fakeExec(() => ({ exitCode: 128 })) });
    assert.equal(results.some((r) => r.name === '.env in git'), false);
});
