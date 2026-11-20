#!/usr/bin/env node

const { run } = require('./cli');

run()
    .then((exitCode) => {
        process.exitCode = exitCode;
    })
    .catch((err) => {
        console.error(`localhost-doctor: unexpected failure\n${err && err.stack ? err.stack : err}`);
        process.exitCode = 1;
    });
