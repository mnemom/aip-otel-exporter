# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.7.1] - 2026-04-18

### Fixed

- **`createWorkersExporter` now auto-normalizes the traces endpoint.**
  OTLP/HTTP receivers (Grafana Cloud, Tempo, most collectors) expect the
  `/v1/traces` subpath per the OTel spec. Historical deployments
  configured with only the ingest base (e.g. `.../otlp`) silently 404'd
  on every flush. The exporter now appends `/v1/traces` idempotently so
  either shape works:
  - `https://otlp-gateway-.../otlp` → POSTs to `.../otlp/v1/traces`
  - `https://otlp-gateway-.../otlp/v1/traces` → unchanged
  - Trailing slashes tolerated on either input.

### Added

- `normalizeTracesEndpoint(endpoint)` exported from `@mnemom/aip-otel-exporter/workers`
  so callers can reuse the same normalization against ad-hoc OTLP clients
  if needed. Four new vitest cases cover append, idempotence, and trailing-
  slash handling.

### Notes

- No breaking changes. Consumers whose `OTLP_ENDPOINT` already points at
  `/v1/traces` (gateway, observer) see no behavior change.
- Scope version in emitted OTLP payloads bumped to `"0.7.1"`.
- Python SDK version unchanged.

## [0.7.0] - 2026-04-17

### Added

- **`WorkersOTelExporter.recordSpan()`** — generic escape hatch for emitting
  arbitrary INTERNAL spans through the same OTLP pipeline as AIP/AAP/CLPI
  telemetry. Intended for callers that need to ship counters or events
  outside the integrity/alignment/policy domains (auth events, rate-limit
  decisions, custom business metrics) without rounding them into an
  AIP-shaped primitive.
- New `SpanInput` type in `types.ts` — `{ name, attributes?, events?, status? }`.
  Status accepts `"ok"` (default), `"error"`, or `"unset"` and maps to OTLP
  status codes 1/2/0 respectively.
- Scope `version` in emitted OTLP payloads bumped to `"0.7.0"`.

### Notes

- Python SDK version unchanged. Workers adapter is TypeScript-only, so
  `recordSpan` is TS-exclusive and does not require Python parity.
- The six existing `record*` methods (`recordIntegrityCheck`,
  `recordVerification`, `recordCoherence`, `recordDrift`,
  `recordReclassification`, `recordPolicyEvaluation`) are unchanged.

## [0.4.0] - 2026-02-22

### Changed

- Coordinated Mnemom 0.4.0 release.

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

[Unreleased]: https://github.com/mnemom/aip-otel-exporter/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/mnemom/aip-otel-exporter/compare/v0.1.0...v0.4.0
[0.1.0]: https://github.com/mnemom/aip-otel-exporter/releases/tag/v0.1.0
