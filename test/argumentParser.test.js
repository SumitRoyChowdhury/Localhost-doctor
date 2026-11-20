const test = require('node:test');
const assert = require('node:assert/strict');
const { parseArguments, ArgumentError } = require('../src/cli/argumentParser');

const validChecks = ['runtime', 'ports', 'network'];
const parse = (argv) => parseArguments(argv, { validChecks });

test('no arguments gives the defaults', () => {
    assert.deepEqual(parse([]), { help: false, version: false, verbose: false, json: false, ports: null, checks: null });
});

test('flags', () => {
    assert.equal(parse(['--help']).help, true);
    assert.equal(parse(['-h']).help, true);
    assert.equal(parse(['--version']).version, true);
    assert.equal(parse(['-v']).version, true);
    const both = parse(['--verbose', '--json']);
    assert.equal(both.verbose, true);
    assert.equal(both.json, true);
});

test('--ports accepts a list, with a space or =, and removes duplicates', () => {
    assert.deepEqual(parse(['--ports', '3000,5432']).ports, [3000, 5432]);
    assert.deepEqual(parse(['--ports=3000, 8080 ,3000']).ports, [3000, 8080]);
    assert.deepEqual(parse(['-p', '1,65535']).ports, [1, 65535]);
});

test('--ports rejects invalid ports with a helpful message', () => {
    for (const bad of ['0', '65536', 'abc', '30.5', '-1', '3000,x']) {
        assert.throws(() => parse(['--ports', bad]), (err) => {
            return err instanceof ArgumentError && /Invalid port|needs a value/.test(err.message);
        }, `expected "${bad}" to be rejected`);
    }
    assert.throws(() => parse(['--ports', ',']), /at least one port/);
});

test('options that need a value say so', () => {
    assert.throws(() => parse(['--ports']), /needs a value/);
    assert.throws(() => parse(['--ports', '--json']), /needs a value/);
    assert.throws(() => parse(['--checks']), /needs a value/);
});

test('--checks validates check names', () => {
    assert.deepEqual(parse(['--checks', 'Ports,runtime,ports']).checks, ['ports', 'runtime']);
    assert.throws(() => parse(['--checks', 'ports,dns']), /Unknown check "dns". Available checks: runtime, ports, network/);
});

test('unknown options, stray arguments and values on flags are rejected', () => {
    assert.throws(() => parse(['--nope']), /Unknown option: --nope/);
    assert.throws(() => parse(['hello']), /Unexpected argument: hello/);
    assert.throws(() => parse(['--json=yes']), /does not take a value/);
});
