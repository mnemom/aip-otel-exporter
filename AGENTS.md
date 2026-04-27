# AGENTS.md — aip-otel-exporter

You are a coding agent working on the **AIP/AAP OpenTelemetry exporter**.
Audience: AI coding tools (Claude Code, Cursor, Cline, Aider) and humans
onboarding via them.

## What this repo is

OTel exporter that ships AIP integrity verdicts and AAP verification
results into any OpenTelemetry-compatible backend (Langfuse, Arize
Phoenix, Datadog, Grafana — anything that speaks OTLP).

Dual-language monorepo:
- `packages/python/` — `aip-otel-exporter` on PyPI (reference)
- `packages/typescript/` — `@mnemom/aip-otel-exporter` on npm

License: **Apache-2.0**.

## Stack

- npm workspaces at the root for the TypeScript package.
- TypeScript: tsup, vitest.
- Python: hatchling, pytest.

## Install + dev

```bash
# TypeScript (from repo root via workspace scripts)
npm install
npm run build           # builds packages/typescript
npm run test            # runs packages/typescript tests
npm run lint

# Or directly inside the package:
cd packages/typescript
npm test
npm run typecheck

# Python
cd packages/python
pip install -e ".[dev]"
pytest
ruff check .
```

## Project layout

```
packages/
  typescript/             # @mnemom/aip-otel-exporter (npm)
    src/
    tests/
    package.json
  python/                 # aip-otel-exporter (PyPI)
    src/
    tests/
    pyproject.toml
docs/                     # mapping tables, integration guides
```

## Conventions

- **The semantic mapping is the source of truth.** AIP/AAP fields →
  OTel attributes (`docs/mapping.md` if present, otherwise the
  attribute constants in `src/`). When AIP or AAP add a field, the
  exporter mapping needs an update in the same release window.
- **Versions stay in lockstep** between the Python and TypeScript
  packages.
- **Apache-2.0 only.**
- Don't bake in vendor-specific telemetry conventions. The exporter
  ships OTel-standard attributes; backend specifics are downstream.
- Commit messages: imperative, concise, describe the **why**.

## Branch protection + deploy

- Never commit directly to `main`. Always feature branch first.
- Branch protection enforced.
- Deploy: `mnemom/deploy` orchestrator publishes to npm + PyPI on
  tagged releases. Don't modify the orchestrator.

## What you should NOT do

- Don't add OTel SDKs as runtime deps that pin specific exporters
  (OTLP, Jaeger, Zipkin). The whole point is platform-neutral.
- Don't drift the Python and TypeScript implementations apart. If a
  mapping changes on one side, mirror the other.
- Don't relicense.
- Don't skip pre-commit hooks (`--no-verify`).
- Don't `git push --force` to `main`.

## Cross-links

- **AIP** (the protocol this exporter ships verdicts from):
  https://github.com/mnemom/aip
- **AAP** (the protocol this exporter ships verification from):
  https://github.com/mnemom/aap
- **Mintlify-hosted protocol docs**:
  https://docs.mnemom.ai/protocols/aip and
  https://docs.mnemom.ai/protocols/aap
- **Public commitment depending on AIP/AAP staying open**:
  https://www.mnemom.ai/for-agents — commitment #6.
