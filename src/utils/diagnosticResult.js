const STATUSES = Object.freeze(['success', 'warning', 'error']);

function createDiagnosticResult(name, status, message, details = {}, options = {}) {
    if (typeof name !== 'string' || name.trim() === '') {
        throw new TypeError('Diagnostic name must be a non-empty string.');
    }

    if (!STATUSES.includes(status)) {
        throw new Error(`Invalid diagnostic status: ${status}`);
    }

    if (typeof message !== 'string') {
        throw new TypeError('Diagnostic message must be a string.');
    }

    if (details === null || typeof details !== 'object' || Array.isArray(details)) {
        throw new TypeError('Diagnostic details must be a plain object.');
    }

    const result = { name, status, message, details };

    if (options.code) {
        result.code = options.code;
    }

    return result;
}

const success = (name, message, details, options) => createDiagnosticResult(name, 'success', message, details, options);
const warning = (name, message, details, options) => createDiagnosticResult(name, 'warning', message, details, options);
const error = (name, message, details, options) => createDiagnosticResult(name, 'error', message, details, options);

function isDiagnosticResult(value) {
    return Boolean(value)
        && typeof value === 'object'
        && typeof value.name === 'string'
        && STATUSES.includes(value.status)
        && typeof value.message === 'string'
        && value.details !== null
        && typeof value.details === 'object';
}

function summarizeResults(results) {
    const summary = { total: 0, success: 0, warning: 0, error: 0 };

    for (const result of results) {
        summary.total += 1;
        summary[result.status] += 1;
    }

    return summary;
}

module.exports = {
    STATUSES,
    createDiagnosticResult,
    success,
    warning,
    error,
    isDiagnosticResult,
    summarizeResults
};
