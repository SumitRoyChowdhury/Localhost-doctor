function getHelpText({ checks = [], defaultPorts = [] } = {}) {
    return `Localhost Doctor - diagnose your local development environment.

Usage:
  localhost-doctor [options]

Options:
  -p, --ports <list>    Ports to check, comma-separated (default: ${defaultPorts.join(',')})
  -c, --checks <list>   Only run these checks, comma-separated
                        Available: ${checks.join(', ')}
      --json            Print the report as JSON
      --verbose         Show all details and timings
  -v, --version         Print the version
  -h, --help            Show this help

Examples:
  localhost-doctor
  localhost-doctor --ports 3000,5432
  localhost-doctor --checks ports,runtime --verbose
  localhost-doctor --json > report.json

Exit codes:
  0  no errors (warnings are allowed)
  1  at least one check reported an error
  2  invalid command-line arguments
`;
}

module.exports = { getHelpText };
