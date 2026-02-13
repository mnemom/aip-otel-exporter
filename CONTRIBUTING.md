# Contributing to aip-otel-exporter

Thank you for your interest in contributing to the AIP/AAP OpenTelemetry Exporter.

## Development Setup

This is a monorepo with TypeScript and Python packages:

```
packages/
  typescript/   # @mnemom/aip-otel-exporter (npm)
  python/       # aip-otel-exporter (PyPI)
```

### TypeScript

```bash
cd packages/typescript
npm install
npm run lint      # Type check (tsc --noEmit)
npm test          # Run tests (vitest)
npm run bench     # Run benchmarks
npm run build     # Compile to dist/
```

### Python

```bash
cd packages/python
pip install -e ".[dev]"
ruff check src/ tests/      # Lint
mypy src/                   # Type check
pytest tests/ -v            # Run tests
```

## Running Tests

### TypeScript — 146 tests

```bash
npm test                     # All tests
npm test -- test/e2e.test.ts # E2E only
npm run bench                # Benchmarks
```

### Python — 47+ tests

```bash
pytest tests/ -v
pytest tests/ --cov=src/aip_otel_exporter  # With coverage
```

## Code Style

### TypeScript

- Strict TypeScript — all strictness flags enabled in `tsconfig.json`
- Type checking via `tsc --noEmit` (no separate linter)
- ESM modules (`"type": "module"`)

### Python

- **ruff** for linting and formatting (`ruff check`, `ruff format`)
- **mypy** in strict mode for type checking
- Target: Python 3.9+
- Line length: 100

## SDK Parity

Both SDKs must stay in sync. When adding features or fixing bugs:

1. Implement in both TypeScript and Python
2. Ensure the same span names, attribute keys, and event structures
3. Update both READMEs if the public API changes
4. Add tests in both languages

The Workers adapter is TypeScript-only (Cloudflare Workers specific).

## Pull Request Process

1. Fork the repository
2. Create a feature branch from `main`
3. Write tests for new functionality
4. Ensure all tests pass (`npm test` + `pytest`)
5. Ensure type checking passes (`npm run lint` + `mypy src/`)
6. Submit a PR with a clear description of the change

## Reporting Issues

Please open an issue on [GitHub Issues](https://github.com/mnemom/aip-otel-exporter/issues) with:

- A clear description of the problem
- Steps to reproduce
- Expected vs actual behavior
- Version of the package and OpenTelemetry SDK

## Key Areas for Contribution

- Additional platform examples (New Relic, Honeycomb, Jaeger, etc.)
- Dashboard templates for other observability platforms
- Performance optimizations
- Documentation improvements
- Python auto-instrumentation enhancements
