const test = require('node:test');
const assert = require('node:assert/strict');
const {
    createDiagnosticResult, success, warning, error, isDiagnosticResult, summarizeResults
} = require('../src/utils/diagnosticResult');

test('creates a result with the standard four fields', () => {
    const result = createDiagnosticResult('Port 3000', 'warning', 'Port 3000 is already occupied.', { port: 3000, available: false });
    assert.deepEqual(result, {
        name: 'Port 3000',
        status: 'warning',
        message: 'Port 3000 is already occupied.',
        details: { port: 3000, available: false }
    });
});

test('details default to an empty object and code is optional', () => {
    assert.deepEqual(createDiagnosticResult('x', 'success', 'ok').details, {});
    assert.equal('code' in createDiagnosticResult('x', 'success', 'ok'), false);
    assert.equal(createDiagnosticResult('x', 'error', 'bad', {}, { code: 'SOME_CODE' }).code, 'SOME_CODE');
});

test('rejects invalid input', () => {
    assert.throws(() => createDiagnosticResult('x', 'ok', 'msg'), /Invalid diagnostic status/);
    assert.throws(() => createDiagnosticResult('', 'success', 'msg'), TypeError);
    assert.throws(() => createDiagnosticResult('x', 'success', 42), TypeError);
    assert.throws(() => createDiagnosticResult('x', 'success', 'msg', null), TypeError);
    assert.throws(() => createDiagnosticResult('x', 'success', 'msg', ['a']), TypeError);
});

test('shortcut helpers set the status', () => {
    assert.equal(success('a', 'b').status, 'success');
    assert.equal(warning('a', 'b').status, 'warning');
    assert.equal(error('a', 'b').status, 'error');
});

test('isDiagnosticResult recognises valid results only', () => {
    assert.equal(isDiagnosticResult(success('a', 'b')), true);
    assert.equal(isDiagnosticResult({ name: 'a', status: 'meh', message: 'b', details: {} }), false);
    assert.equal(isDiagnosticResult(null), false);
    assert.equal(isDiagnosticResult('text'), false);
});

test('summarizeResults counts each status', () => {
    const summary = summarizeResults([success('a', 'b'), success('c', 'd'), warning('e', 'f'), error('g', 'h')]);
    assert.deepEqual(summary, { total: 4, success: 2, warning: 1, error: 1 });
});
