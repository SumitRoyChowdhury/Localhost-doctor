const test = require('node:test');
const assert = require('node:assert/strict');
const { DiagnosticEngine } = require('../src/core/diagnosticEngine');
const { createDefaultEngine, DIAGNOSTIC_IDS } = require('../src/core/diagnosticRegistry');
const { success, warning } = require('../src/utils/diagnosticResult');

test('register validates input and rejects duplicates', () => {
    const engine = new DiagnosticEngine();
    engine.register('a', { title: 'A', run: async () => [] });

    assert.throws(() => engine.register('a', { run: async () => [] }), /already registered/);
    assert.throws(() => engine.register('b', {}), /run\(\) function/);
    assert.throws(() => engine.register('', { run: async () => [] }), TypeError);
    assert.deepEqual(engine.list(), [{ id: 'a', title: 'A' }]);
});

test('runs diagnostics, keeps registration order and summarizes', async () => {
    const engine = new DiagnosticEngine();
    engine.register('slow', { title: 'Slow', run: () => new Promise((r) => setTimeout(() => r([warning('w', 'w')]), 30)) });
    engine.register('fast', { title: 'Fast', run: async () => [success('s', 's'), success('t', 't')] });

    const report = await engine.run();

    assert.deepEqual(report.sections.map((s) => s.id), ['slow', 'fast']);
    assert.deepEqual(report.summary, { total: 3, success: 2, warning: 1, error: 0 });
    assert.equal(typeof report.sections[0].durationMs, 'number');
});

test('passes the context to every diagnostic', async () => {
    const engine = new DiagnosticEngine();
    let received;
    engine.register('a', { run: async (context) => { received = context; return []; } });

    await engine.run({ context: { ports: [1234] } });
    assert.deepEqual(received, { ports: [1234] });
});

test('a crashing diagnostic becomes an error result and others still run', async () => {
    const engine = new DiagnosticEngine();
    engine.register('broken', { title: 'Broken', run: () => { throw new Error('boom'); } });
    engine.register('ok', { title: 'OK', run: async () => [success('fine', 'fine')] });

    const report = await engine.run();
    const [broken, ok] = report.sections;

    assert.equal(broken.results[0].status, 'error');
    assert.equal(broken.results[0].code, 'DIAGNOSTIC_CRASHED');
    assert.match(broken.results[0].message, /boom/);
    assert.equal(ok.results[0].status, 'success');
});

test('a diagnostic returning invalid data is reported, not trusted', async () => {
    const engine = new DiagnosticEngine();
    engine.register('bad', { run: async () => [{ hello: 'world' }] });

    const report = await engine.run();
    assert.equal(report.sections[0].results[0].code, 'DIAGNOSTIC_CRASHED');
});

test('a hanging diagnostic times out', async () => {
    const engine = new DiagnosticEngine({ timeout: 50 });
    let timer;
    engine.register('hang', { title: 'Hang', run: () => new Promise((resolve) => { timer = setTimeout(resolve, 5000); }) });

    const report = await engine.run();
    clearTimeout(timer);

    assert.equal(report.sections[0].results[0].code, 'DIAGNOSTIC_TIMEOUT');
});

test('only runs selected diagnostics, in the requested order', async () => {
    const engine = new DiagnosticEngine();
    for (const id of ['a', 'b', 'c']) engine.register(id, { run: async () => [success(id, id)] });

    const report = await engine.run({ only: ['c', 'a'] });
    assert.deepEqual(report.sections.map((s) => s.id), ['c', 'a']);
    await assert.rejects(() => engine.run({ only: ['zzz'] }), /Unknown diagnostic: zzz/);
});

test('the default engine registers every built-in diagnostic', () => {
    const engine = createDefaultEngine();
    assert.deepEqual(engine.list().map((d) => d.id), [...DIAGNOSTIC_IDS]);
    assert.deepEqual([...DIAGNOSTIC_IDS], ['runtime', 'system', 'ports', 'database', 'dependencies', 'environment', 'network']);
});
