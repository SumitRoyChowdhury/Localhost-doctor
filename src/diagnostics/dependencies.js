const fs = require('node:fs/promises');
const path = require('node:path');
const { success, warning, error } = require('../utils/diagnosticResult');
const { readPackageJson, declaredDependencies, pathExists } = require('../utils/project');

const LOCKFILES = Object.freeze([
    { file: 'package-lock.json', manager: 'npm' },
    { file: 'npm-shrinkwrap.json', manager: 'npm' },
    { file: 'yarn.lock', manager: 'Yarn' },
    { file: 'pnpm-lock.yaml', manager: 'pnpm' },
    { file: 'bun.lock', manager: 'Bun' },
    { file: 'bun.lockb', manager: 'Bun' }
]);

async function isInstalled(cwd, packageName) {
    let dir = path.resolve(cwd);

    while (true) {
        if (await pathExists(path.join(dir, 'node_modules', packageName, 'package.json'))) return true;

        const parent = path.dirname(dir);
        if (parent === dir) return false;
        dir = parent;
    }
}

function list(names, max = 8) {
    const shown = names.slice(0, max).join(', ');
    return names.length > max ? `${shown} (+${names.length - max} more)` : shown;
}

async function mtime(filePath) {
    try {
        return (await fs.stat(filePath)).mtimeMs;
    } catch {
        return null;
    }
}

async function checkLockfile(cwd) {
    const name = 'Lockfile';
    const found = [];

    for (const lock of LOCKFILES) {
        if (await pathExists(path.join(cwd, lock.file))) found.push(lock);
    }

    if (found.length === 0) {
        return warning(name, 'No lockfile found, so installs may get different dependency versions.', {}, { code: 'LOCKFILE_MISSING' });
    }

    const files = found.map((l) => l.file);
    const managers = [...new Set(found.map((l) => l.manager))];

    if (managers.length > 1) {
        return warning(name, `Lockfiles from several package managers were found: ${files.join(', ')}.`,
            { lockfiles: files }, { code: 'LOCKFILES_MULTIPLE' });
    }

    if (files.includes('package-lock.json')) {
        const lockTime = await mtime(path.join(cwd, 'package-lock.json'));
        const installTime = await mtime(path.join(cwd, 'node_modules', '.package-lock.json'));

        if (lockTime !== null && installTime !== null && lockTime > installTime + 1000) {
            return warning(name, 'package-lock.json changed after the last `npm install`.',
                { lockfiles: files }, { code: 'LOCKFILE_OUT_OF_SYNC' });
        }
    }

    return success(name, `Using ${managers[0]} (${files.join(', ')}).`, { lockfiles: files, manager: managers[0] });
}

async function run(context = {}) {
    const cwd = context.cwd || process.cwd();
    const pkg = await readPackageJson(cwd);

    if (!pkg.found) {
        return [warning('package.json', `No package.json in ${cwd}. Run Localhost Doctor from your project folder to check dependencies.`,
            { cwd }, { code: 'NO_PACKAGE_JSON' })];
    }

    if (pkg.error) {
        return [error('package.json', `package.json could not be read: ${pkg.error}`, {}, { code: 'PACKAGE_JSON_INVALID' })];
    }

    const label = [pkg.data.name, pkg.data.version].filter(Boolean).join('@') || 'this project';
    const results = [success('package.json', `Found package.json for ${label}.`, { name: pkg.data.name || null, version: pkg.data.version || null })];

    const declared = declaredDependencies(pkg.data);

    if (declared.length === 0) {
        results.push(success('Dependencies', 'No dependencies are declared.', { declared: 0 }));
        return results;
    }

    const missing = [];
    for (const name of declared) {
        if (!(await isInstalled(cwd, name))) missing.push(name);
    }

    const details = { declared: declared.length, missing };

    if (missing.length === declared.length && !(await pathExists(path.join(cwd, 'node_modules')))) {
        results.push(error('Dependencies', `node_modules is missing, so none of the ${declared.length} declared dependencies are installed.`,
            details, { code: 'NODE_MODULES_MISSING' }));
    } else if (missing.length > 0) {
        results.push(error('Dependencies', `${missing.length} of ${declared.length} declared dependencies are not installed: ${list(missing)}.`,
            details, { code: 'DEPENDENCIES_MISSING' }));
    } else {
        results.push(success('Dependencies', `All ${declared.length} declared dependencies are installed.`, details));
    }

    results.push(await checkLockfile(cwd));
    return results;
}

module.exports = { run, isInstalled };
