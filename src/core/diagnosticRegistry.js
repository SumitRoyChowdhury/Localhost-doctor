const { DiagnosticEngine } = require('./diagnosticEngine');

const BUILT_IN_DIAGNOSTICS = Object.freeze([
    { id: 'runtime', title: 'Runtime', module: require('../diagnostics/runtime') },
    { id: 'system', title: 'System', module: require('../diagnostics/system') },
    { id: 'ports', title: 'Ports', module: require('../diagnostics/ports') },
    { id: 'database', title: 'Databases', module: require('../diagnostics/database') },
    { id: 'dependencies', title: 'Dependencies', module: require('../diagnostics/dependencies') },
    { id: 'environment', title: 'Environment', module: require('../diagnostics/environment') },
    { id: 'network', title: 'Network', module: require('../diagnostics/network') }
]);

const DIAGNOSTIC_IDS = Object.freeze(BUILT_IN_DIAGNOSTICS.map((d) => d.id));

function createDefaultEngine(options = {}) {
    const engine = new DiagnosticEngine(options);

    for (const { id, title, module } of BUILT_IN_DIAGNOSTICS) {
        engine.register(id, { title, run: module.run });
    }

    return engine;
}

module.exports = { BUILT_IN_DIAGNOSTICS, DIAGNOSTIC_IDS, createDefaultEngine };
