function formatJsonReport(report, { version, recommendations = [], cwd = process.cwd(), now = new Date() } = {}) {
    const output = {
        tool: 'localhost-doctor',
        version: version || null,
        generatedAt: now.toISOString(),
        platform: `${process.platform}-${process.arch}`,
        cwd,
        summary: report.summary,
        sections: report.sections,
        recommendations
    };

    return `${JSON.stringify(output, null, 2)}\n`;
}

module.exports = { formatJsonReport };
