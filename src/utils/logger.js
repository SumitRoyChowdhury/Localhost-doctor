function createLogger({ verbose = false, stream = process.stderr } = {}) {
    return {
        verbose,
        debug(message) {
            if (verbose) stream.write(`[debug] ${message}\n`);
        }
    };
}

const silentLogger = createLogger({ verbose: false });

module.exports = { createLogger, silentLogger };
