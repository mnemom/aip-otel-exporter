# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-02-13

### Added

- **Manual API** — `createAIPOTelRecorder()` factory for recording AIP integrity checks and AAP
  verification results as OpenTelemetry spans
  - `recordIntegrityCheck()` — 22 domain attributes + 2 GenAI SIG aliases, concern events, drift
    alert events
  - `recordVerification()` — 8 attributes, per-violation events
  - `recordCoherence()` — 5 attributes
  - `recordDrift()` — 2 attributes, per-alert events with full analysis detail
- **Auto-instrumentation** — monkey-patching wrapper for `AIPClient.check()`, `verifyTrace()`,
  `checkCoherence()`, and `detectDrift()` via `@mnemom/aip-otel-exporter/auto`
- **Cloudflare Workers adapter** — zero-dependency OTLP exporter using only `fetch()` and
  `crypto.getRandomValues()` via `@mnemom/aip-otel-exporter/workers`
- **Metrics API** — 9 OTel metric instruments (5 counters, 4 histograms) covering integrity checks,
  concerns, violations, analysis duration, coherence scores, and drift alerts
- **Pre-built dashboards** — Grafana (overview + detail) and Datadog dashboard templates
- **Platform examples** — Integration examples for Langfuse, Arize Phoenix, Datadog, and
  Cloudflare Workers
- **Python SDK** — Full parity with TypeScript: manual recording, auto-instrumentation, metrics
- **Duck-typed inputs** — No hard dependency on AIP/AAP packages; works with any compatible shape
- **GenAI SIG forward-compat** — `gen_ai.evaluation.verdict` and `gen_ai.evaluation.score` aliases
  for future OpenTelemetry GenAI SIG alignment
- **CI/CD pipeline** — Automated testing (TypeScript + Python matrix), CodeQL security analysis,
  and dual publishing to npm + PyPI with version-gated deduplication

[Unreleased]: https://github.com/mnemom/aip-otel-exporter/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/mnemom/aip-otel-exporter/releases/tag/v0.1.0
