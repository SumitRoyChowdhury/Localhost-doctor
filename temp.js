const { createDiagnosticResult } = require('./utils/diagnosticResult');

const result = createDiagnosticResult(
    'Node.js',
    'success',
    'Node.js is installed and available.',
    {
        version: 'v24.13.1'
    }
);

console.log(result);