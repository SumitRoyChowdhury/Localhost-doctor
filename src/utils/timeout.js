function withTimeout(promise, ms, message = `Timed out after ${ms} ms`) {
    let timer;

    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
            const err = new Error(message);
            err.code = 'ETIMEDOUT';
            reject(err);
        }, ms);
    });

    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

module.exports = { withTimeout };
