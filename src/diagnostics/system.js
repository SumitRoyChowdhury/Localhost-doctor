const os = require('node:os');
const { success, warning } = require('../utils/diagnosticResult');
const { runCommand } = require('../utils/exec');

function gigabytes(bytes) {
    return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

async function checkOperatingSystem(platform, exec) {
    let label = `${os.type()} ${os.release()}`;

    if (platform === 'darwin') {
        const result = await exec('sw_vers', ['-productVersion'], { timeout: 3000 });
        if (result.ok && result.stdout.trim()) label = `macOS ${result.stdout.trim()}`;
    }

    return success('Operating system', `${label}.`, { platform, type: os.type(), release: os.release() });
}

async function checkArchitecture(platform, arch, exec) {
    const name = 'Architecture';
    const machine = typeof os.machine === 'function' ? os.machine() : arch;

    if (platform === 'darwin' && arch === 'x64') {
        const result = await exec('sysctl', ['-n', 'sysctl.proc_translated'], { timeout: 3000 });
        if (result.ok && result.stdout.trim() === '1') {
            return warning(name, 'Node.js is an x64 build running under Rosetta on an Apple Silicon Mac.',
                { arch, machine }, { code: 'ROSETTA' });
        }
    }

    return success(name, `${arch} (machine: ${machine}).`, { arch, machine });
}

function checkNodePlatform() {
    const { platform, arch, versions } = process;
    return success('Node.js platform', `${platform}-${arch}, V8 ${versions.v8}, libuv ${versions.uv}.`,
        { platform, arch, v8: versions.v8, uv: versions.uv });
}

function checkMemory() {
    const total = os.totalmem();
    const free = os.freemem();
    return success('Memory', `${gigabytes(total)} total, ${gigabytes(free)} free.`, { totalBytes: total, freeBytes: free });
}

function checkCpu() {
    const cpus = os.cpus();
    const model = cpus.length > 0 ? cpus[0].model.trim() : 'unknown CPU';
    return success('CPU', `${cpus.length} cores (${model}).`, { cores: cpus.length, model });
}

async function run(context = {}) {
    const platform = context.platform || process.platform;
    const arch = context.arch || process.arch;
    const exec = context.exec || runCommand;

    const [operatingSystem, architecture] = await Promise.all([
        checkOperatingSystem(platform, exec),
        checkArchitecture(platform, arch, exec)
    ]);

    return [operatingSystem, architecture, checkNodePlatform(), checkMemory(), checkCpu()];
}

module.exports = { run };
