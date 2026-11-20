const fs = require('node:fs/promises');
const path = require('node:path');

async function readPackageJson(cwd) {
    const filePath = path.join(cwd, 'package.json');

    let content;
    try {
        content = await fs.readFile(filePath, 'utf8');
    } catch (err) {
        if (err.code === 'ENOENT') return { found: false, data: null, error: null };
        return { found: true, data: null, error: err.code || err.message };
    }

    try {
        const data = JSON.parse(content);
        if (data === null || typeof data !== 'object' || Array.isArray(data)) {
            return { found: true, data: null, error: 'package.json must contain a JSON object' };
        }
        return { found: true, data, error: null };
    } catch (err) {
        return { found: true, data: null, error: err.message };
    }
}

function declaredDependencies(packageJson) {
    if (!packageJson) return [];
    const names = new Set([
        ...Object.keys(packageJson.dependencies || {}),
        ...Object.keys(packageJson.devDependencies || {})
    ]);
    return [...names];
}

async function pathExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

module.exports = { readPackageJson, declaredDependencies, pathExists };
