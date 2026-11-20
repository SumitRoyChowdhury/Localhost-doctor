const ICONS = { success: '✔', warning: '⚠', error: '✖' };
const COLOR_CODES = { success: 32, warning: 33, error: 31, bold: 1, dim: 2 };

function createPainter(enabled) {
    return (text, style) => (enabled ? `\x1b[${COLOR_CODES[style]}m${text}\x1b[0m` : text);
}

function shouldUseColor(stream, env = process.env) {
    if (env.NO_COLOR !== undefined && env.NO_COLOR !== '') return false;
    if (env.FORCE_COLOR !== undefined && env.FORCE_COLOR !== '0') return true;
    return Boolean(stream && stream.isTTY) && env.TERM !== 'dumb';
}

function formatValue(value) {
    if (value === null || value === undefined) return '-';
    if (Array.isArray(value)) return value.length > 0 ? value.map(formatValue).join(', ') : '(none)';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}

function detailLines(result, verbose) {
    const details = result.details || {};
    const lines = [];

    if (Array.isArray(details.processes)) {
        for (const p of details.processes) {
            const where = p.addresses && p.addresses.length > 0 ? ` listening on ${p.addresses.join(', ')}` : '';
            lines.push(`↳ ${p.name} (PID ${p.pid})${where}`);
        }
    }

    if (verbose) {
        for (const [key, value] of Object.entries(details)) {
            if (key === 'processes') continue;
            lines.push(`${key}: ${formatValue(value)}`);
        }
    }

    return lines;
}

function plural(count, word) {
    return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function formatSummary(summary, paint) {
    const parts = [
        paint(`${summary.success} passed`, 'success'),
        paint(plural(summary.warning, 'warning'), summary.warning > 0 ? 'warning' : 'dim'),
        paint(plural(summary.error, 'error'), summary.error > 0 ? 'error' : 'dim')
    ];
    return `${paint('Summary:', 'bold')} ${parts.join(', ')}`;
}

function formatDiagnosticReport(report, { verbose = false, color = false, recommendations = [], version } = {}) {
    const paint = createPainter(color);
    const allResults = report.sections.flatMap((s) => s.results);
    const nameWidth = Math.max(0, ...allResults.map((r) => r.name.length));
    const detailIndent = ' '.repeat(nameWidth + 6);
    const lines = [];

    lines.push('');
    lines.push(paint(`Localhost Doctor${version ? ` v${version}` : ''}`, 'bold'));
    lines.push(paint('Checking your local development environment', 'dim'));
    lines.push('');

    for (const section of report.sections) {
        const timing = verbose ? paint(` (${section.durationMs} ms)`, 'dim') : '';
        lines.push(`${paint(section.title, 'bold')}${timing}`);

        for (const result of section.results) {
            const icon = paint(ICONS[result.status], result.status);
            lines.push(`  ${icon} ${result.name.padEnd(nameWidth)}  ${result.message}`);

            for (const detail of detailLines(result, verbose)) {
                lines.push(`${detailIndent}${paint(detail, 'dim')}`);
            }
        }

        lines.push('');
    }

    if (recommendations.length > 0) {
        lines.push(paint('Recommendations', 'bold'));
        recommendations.forEach((rec, index) => {
            lines.push(`  ${index + 1}. ${paint(ICONS[rec.status], rec.status)} ${rec.text}`);
        });
        lines.push('');
    }

    lines.push(formatSummary(report.summary, paint));
    lines.push('');

    return lines.join('\n');
}

module.exports = { formatDiagnosticReport, shouldUseColor, ICONS };
