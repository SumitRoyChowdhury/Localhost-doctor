const { version } = require('../../package.json');
const { parseArguments, ArgumentError } = require('./argumentParser');
const { getHelpText } = require('./help');
const { createDefaultEngine, DIAGNOSTIC_IDS } = require('../core/diagnosticRegistry');
const { DEFAULT_PORTS } = require('../diagnostics/ports');
const { getRecommendations } = require('../recommendations/recommendationEngine');
const { formatDiagnosticReport, shouldUseColor } = require('../utils/formatDiagnosticReport');
const { formatJsonReport } = require('../utils/formatJsonReport');
const { createLogger } = require('../utils/logger');

const EXIT_OK = 0;
const EXIT_PROBLEMS = 1;
const EXIT_USAGE = 2;

async function run({
    argv = process.argv.slice(2),
    stdout = process.stdout,
    stderr = process.stderr,
    cwd = process.cwd(),
    env = process.env,
    engine
} = {}) {
    let options;
    try {
        options = parseArguments(argv, { validChecks: DIAGNOSTIC_IDS });
    } catch (err) {
        if (!(err instanceof ArgumentError)) throw err;
        stderr.write(`localhost-doctor: ${err.message}\nRun "localhost-doctor --help" for usage.\n`);
        return EXIT_USAGE;
    }

    if (options.help) {
        stdout.write(getHelpText({ checks: DIAGNOSTIC_IDS, defaultPorts: DEFAULT_PORTS }));
        return EXIT_OK;
    }

    if (options.version) {
        stdout.write(`${version}\n`);
        return EXIT_OK;
    }

    const logger = createLogger({ verbose: options.verbose, stream: stderr });
    const diagnosticEngine = engine || createDefaultEngine({ logger });

    const context = {
        cwd,
        env,
        logger,
        verbose: options.verbose,
        ports: options.ports || DEFAULT_PORTS
    };

    const report = await diagnosticEngine.run({ only: options.checks, context });
    const recommendations = getRecommendations(report.sections);

    if (options.json) {
        stdout.write(formatJsonReport(report, { version, recommendations, cwd }));
    } else {
        stdout.write(formatDiagnosticReport(report, {
            version,
            recommendations,
            verbose: options.verbose,
            color: shouldUseColor(stdout, env)
        }));
    }

    return report.summary.error > 0 ? EXIT_PROBLEMS : EXIT_OK;
}

module.exports = { run, EXIT_OK, EXIT_PROBLEMS, EXIT_USAGE };
