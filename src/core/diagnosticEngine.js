const { error, isDiagnosticResult, summarizeResults } = require('../utils/diagnosticResult');
const { withTimeout } = require('../utils/timeout');
const { silentLogger } = require('../utils/logger');

class DiagnosticEngine {
    constructor({ timeout = 20000, logger = silentLogger } = {}) {
        this.timeout = timeout;
        this.logger = logger;
        this.diagnostics = new Map();
    }

    register(id, { title, run }) {
        if (typeof id !== 'string' || id === '') throw new TypeError('Diagnostic id must be a non-empty string.');
        if (typeof run !== 'function') throw new TypeError(`Diagnostic "${id}" must have a run() function.`);
        if (this.diagnostics.has(id)) throw new Error(`Diagnostic "${id}" is already registered.`);

        this.diagnostics.set(id, { id, title: title || id, run });
        return this;
    }

    has(id) {
        return this.diagnostics.has(id);
    }

    list() {
        return [...this.diagnostics.values()].map(({ id, title }) => ({ id, title }));
    }

    async run({ only, context = {} } = {}) {
        const selected = only && only.length > 0
            ? only.map((id) => {
                if (!this.diagnostics.has(id)) throw new Error(`Unknown diagnostic: ${id}`);
                return this.diagnostics.get(id);
            })
            : [...this.diagnostics.values()];

        const sections = await Promise.all(selected.map((diagnostic) => this.runOne(diagnostic, context)));
        const summary = summarizeResults(sections.flatMap((section) => section.results));

        return { sections, summary };
    }

    async runOne({ id, title, run }, context) {
        const started = Date.now();
        this.logger.debug(`running ${id}`);

        let results;
        try {
            const output = await withTimeout(Promise.resolve().then(() => run(context)), this.timeout);

            if (!Array.isArray(output) || !output.every(isDiagnosticResult)) {
                throw new Error('it did not return a list of diagnostic results');
            }
            results = output;
        } catch (err) {
            const timedOut = err.code === 'ETIMEDOUT';
            const message = timedOut
                ? `${title} diagnostics did not finish within ${Math.round(this.timeout / 1000)} seconds.`
                : `${title} diagnostics failed unexpectedly: ${err.message}`;

            this.logger.debug(`${id} failed: ${err.stack || err.message}`);
            results = [error(title, message, {}, { code: timedOut ? 'DIAGNOSTIC_TIMEOUT' : 'DIAGNOSTIC_CRASHED' })];
        }

        const durationMs = Date.now() - started;
        this.logger.debug(`${id} finished in ${durationMs} ms`);

        return { id, title, durationMs, results };
    }
}

module.exports = { DiagnosticEngine };
