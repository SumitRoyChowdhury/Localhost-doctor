# Localhost Doctor

A command-line tool that checks whether your machine is ready for local development, in one command.

```
$ localhost-doctor

Localhost Doctor v1.0.0
Checking your local development environment

Runtime
  ✔ Node.js           Node.js v24.13.1 is running.
  ✔ npm               npm 11.8.0 is installed.

Ports
  ⚠ Port 3000         Port 3000 is already occupied by node (PID 3422).
                      ↳ node (PID 3422) listening on *:3000
  ✔ Port 8080         Port 8080 is available.

Databases
  ✔ PostgreSQL        PostgreSQL is accepting connections on localhost:5432.
                      ↳ postgres (PID 891) listening on [::1]:5432, 127.0.0.1:5432

Recommendations
  1. ⚠ Port 3000 is used by node (PID 3422). If you don't need it, stop it with `kill 3422`, or start your app on a different port.

Summary: 18 passed, 1 warning, 0 errors
```

## What it checks

| Check | What it looks at |
|---|---|
| `runtime` | Node.js version; whether npm is installed and runs |
| `system` | macOS/OS version, CPU architecture (also detects Node.js running under Rosetta), Node.js platform, memory, CPU |
| `ports` | Whether ports are free, and which process (name and PID) uses each busy port |
| `database` | Whether PostgreSQL (5432) and MySQL (3306) are running, whether the project needs them, and whether `DATABASE_URL` can be reached |
| `dependencies` | `package.json`, `node_modules`, missing packages, lockfiles |
| `environment` | `.env` file, variables required by `.env.example`, whether `.env` is ignored by git |
| `network` | `localhost` resolution, DNS, internet connection |

Localhost Doctor only **reads** information. It never stops processes, never changes files, and never prints the values of environment variables or database passwords.

## Requirements

- Node.js 18 or newer
- macOS. Linux should work too. On Windows everything except process identification works.
- `lsof` for process identification (built into macOS)

## Installation

```bash
# Run once without installing
npx localhost-doctor

# Or install globally
npm install -g localhost-doctor
localhost-doctor
```

## Usage

```
localhost-doctor [options]

  -p, --ports <list>    Ports to check, comma-separated (default: 3000,5173,8000,8080)
  -c, --checks <list>   Only run these checks: runtime, system, ports, database,
                        dependencies, environment, network
      --json            Print the report as JSON
      --verbose         Show all details and timings
  -v, --version         Print the version
  -h, --help            Show help
```

Examples:

```bash
localhost-doctor --ports 3000,5432
localhost-doctor --checks ports,runtime --verbose
localhost-doctor --json > report.json
```

Run it from your project folder so the dependency and environment checks look at your project.

### Exit codes

| Code | Meaning |
|---|---|
| `0` | No errors (warnings are allowed) |
| `1` | At least one check reported an error |
| `2` | Invalid command-line arguments |

This makes it usable in scripts and CI, for example `localhost-doctor --checks runtime,dependencies || exit 1`.

### Required environment variables

List every variable your project needs in `.env.example`, one per line (`API_KEY=`). Localhost Doctor reports any that are missing or empty in `.env` or in your shell environment. It shows only variable **names**, never values.

### Colors

Colors are used only when writing to a terminal. Set `NO_COLOR=1` to turn them off or `FORCE_COLOR=1` to force them on.

## Notes and limitations

- If a busy port belongs to another user (for example a system service running as root), `lsof` cannot see it without `sudo`. The report says so and suggests the `sudo lsof` command.
- `DATABASE_URL` is checked at the network level only (can the host and port be reached?). No login is attempted.
- On macOS, "free memory" is low on purpose because the OS uses spare memory as cache, so it is shown for information only.

## Development

```bash
git clone <repo-url>
cd localhost-doctor
npm test            # runs the test suite with node:test
node src/index.js   # run without installing
npm link            # makes `localhost-doctor` available globally from your working copy
```

### Fixing `EACCES` errors with `npm link` / `npm install -g` on macOS

If npm's global folder is `/usr/local/lib/node_modules` and owned by root, global installs fail with `EACCES`. Don't use `sudo npm`. Use one of these instead:

1. **Use a version manager** such as [nvm](https://github.com/nvm-sh/nvm) (recommended). It installs Node.js in your home folder, so global installs never need special permissions.
2. **Or move npm's global folder to your home folder:**
   ```bash
   mkdir -p ~/.npm-global
   npm config set prefix ~/.npm-global
   echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> ~/.zshrc
   source ~/.zshrc
   ```

Then run `npm link` again.

### Project structure

```
src/
  index.js                      executable entry point (shebang)
  cli/                          argument parsing, help, orchestration
  core/                         diagnostic engine and registry
  diagnostics/                  one file per check (runtime, ports, process, ...)
  recommendations/              advice for each problem code
  utils/                        result helper, report formatters, safe exec, TCP probe, .env parser
test/                           node:test test suite
```

To add a check, create `src/diagnostics/<name>.js` exporting `async run(context)` that returns an array of results made with `createDiagnosticResult()`, then register it in `src/core/diagnosticRegistry.js`.

## License

ISC
