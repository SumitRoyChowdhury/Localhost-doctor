const test = require('node:test');
const assert = require('node:assert/strict');
const { formatDiagnosticReport, shouldUseColor } = require('../src/utils/formatDiagnosticReport');
const { formatJsonReport } = require('../src/utils/formatJsonReport');
const { getRecommendations } = require('../src/recommendations/recommendationEngine');
const { success, warning, error, summarizeResults } = require('../src/utils/diagnosticResult');

function sampleReport() {
    const sections = [
        { id: 'runtime', title: 'Runtime', durationMs: 12, results: [success('Node.js', 'Node.js v20.0.0 is running.', { version: 'v20.0.0' })] },
        {
            id: 'ports',
            title: 'Ports',
            durationMs: 30,
            results: [
                warning('Port 3000', 'Port 3000 is already occupied by node (PID 77).',
                    { port: 3000, available: false, processes: [{ pid: 77, name: 'node', addresses: ['*:3000'] }] },
                    { code: 'PORT_IN_USE' }),
                error('Port 99999', '99999 is not a valid port.', { port: 99999 }, { code: 'INVALID_PORT' })
            ]
        }
    ];
    return { sections, summary: summarizeResults(sections.flatMap((s) => s.results)) };
}

test('text report has heading, sections, icons, processes, recommendations and summary', () => {
    const report = sampleReport();
    const text = formatDiagnosticReport(report, { version: '1.2.3', recommendations: getRecommendations(report.sections) });

    assert.match(text, /Localhost Doctor v1\.2\.3/);
    assert.match(text, /^Runtime$/m);
    assert.match(text, /^Ports$/m);
    assert.match(text, /✔ Node\.js/);
    assert.match(text, /⚠ Port 3000/);
    assert.match(text, /✖ Port 99999/);
    assert.match(text, /↳ node \(PID 77\) listening on \*:3000/);
    assert.match(text, /Recommendations/);
    assert.match(text, /kill 77/);
    assert.match(text, /Summary: 1 passed, 1 warning, 1 error/);
    assert.doesNotMatch(text, /\x1b\[/, 'no colors unless asked');
});

test('verbose report shows every detail and timings', () => {
    const text = formatDiagnosticReport(sampleReport(), { verbose: true });
    assert.match(text, /version: v20\.0\.0/);
    assert.match(text, /available: false/);
    assert.match(text, /Ports \(30 ms\)/);
});

test('non-verbose report hides extra details', () => {
    const text = formatDiagnosticReport(sampleReport());
    assert.doesNotMatch(text, /version: v20/);
});

test('colors are added only when enabled', () => {
    assert.match(formatDiagnosticReport(sampleReport(), { color: true }), /\x1b\[32m/);
});

test('shouldUseColor respects TTY, NO_COLOR and FORCE_COLOR', () => {
    assert.equal(shouldUseColor({ isTTY: true }, {}), true);
    assert.equal(shouldUseColor({ isTTY: false }, {}), false);
    assert.equal(shouldUseColor({ isTTY: true }, { NO_COLOR: '1' }), false);
    assert.equal(shouldUseColor({ isTTY: false }, { FORCE_COLOR: '1' }), true);
    assert.equal(shouldUseColor({ isTTY: true }, { TERM: 'dumb' }), false);
});

test('JSON report is valid JSON with a stable shape', () => {
    const report = sampleReport();
    const json = JSON.parse(formatJsonReport(report, {
        version: '1.2.3',
        recommendations: getRecommendations(report.sections),
        cwd: '/project',
        now: new Date('2026-01-01T00:00:00Z')
    }));

    assert.equal(json.tool, 'localhost-doctor');
    assert.equal(json.version, '1.2.3');
    assert.equal(json.generatedAt, '2026-01-01T00:00:00.000Z');
    assert.equal(json.cwd, '/project');
    assert.deepEqual(json.summary, { total: 3, success: 1, warning: 1, error: 1 });
    assert.equal(json.sections[1].results[0].details.processes[0].pid, 77);
    assert.equal(json.recommendations.length, 2);
});

test('recommendations: errors first, no advice for successes, no duplicates', () => {
    const sections = [{
        title: 'Mixed',
        results: [
            warning('Port 1', 'busy', { port: 1, processes: [] }, { code: 'PORT_IN_USE' }),
            success('ok', 'fine', {}, { code: 'PORT_IN_USE' }),
            error('npm', 'missing', {}, { code: 'NPM_MISSING' }),
            error('npm again', 'missing', {}, { code: 'NPM_MISSING' }),
            error('unknown', 'no rule', {}, { code: 'NOT_A_REAL_CODE' })
        ]
    }];

    const recs = getRecommendations(sections);
    assert.deepEqual(recs.map((r) => r.code), ['NPM_MISSING', 'PORT_IN_USE']);
    assert.match(recs[1].text, /sudo lsof -nP -iTCP:1 -sTCP:LISTEN/);
});
