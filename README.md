[![CI](https://github.com/mnemom/aip-otel-exporter/actions/workflows/ci.yml/badge.svg)](https://github.com/mnemom/aip-otel-exporter/actions/workflows/ci.yml)
[![CodeQL](https://github.com/mnemom/aip-otel-exporter/actions/workflows/codeql.yml/badge.svg)](https://github.com/mnemom/aip-otel-exporter/actions/workflows/codeql.yml)
[![npm](https://img.shields.io/npm/v/@mnemom/aip-otel-exporter)](https://www.npmjs.com/package/@mnemom/aip-otel-exporter)
[![PyPI](https://img.shields.io/pypi/v/aip-otel-exporter)](https://pypi.org/project/aip-otel-exporter/)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![AIP](https://img.shields.io/badge/AIP-compliant-green.svg)](https://github.com/mnemom/aip)
[![AAP](https://img.shields.io/badge/AAP-compliant-green.svg)](https://github.com/mnemom/aap)

# aip-otel-exporter

**OpenTelemetry exporter for [AIP](https://github.com/mnemom/aip) integrity checkpoints and [AAP](https://github.com/mnemom/aap) verification results.**

Send AIP/AAP telemetry to any OTel-compatible observability platform — Langfuse, Arize Phoenix,
Datadog, Grafana — with zero custom code.

## Why

AIP and AAP produce rich alignment telemetry: integrity verdicts, concerns, verification results,
coherence scores, drift alerts. But this data is only useful if it's observable. This exporter
bridges the gap between protocol output and your existing observability stack by mapping everything
onto [OpenTelemetry](https://opentelemetry.io/) spans, events, and metrics.

```
AIP/AAP Protocol Output ──→ aip-otel-exporter ──→ OTel SDK ──→ Your Platform
                                                      │
                                                      ├── Langfuse
                                                      ├── Arize Phoenix
                                                      ├── Datadog
                                                      ├── Grafana / Tempo
                                                      └── Any OTLP endpoint
```

## Three Integration Layers

| Layer | TypeScript | Python | OTel SDK? | Use Case |
|---|---|---|---|---|
| **Manual API** | `@mnemom/aip-otel-exporter` | `aip-otel-exporter[otel]` | Yes | Full control, works everywhere |
| **Auto-instrumentation** | `@mnemom/aip-otel-exporter/auto` | `AIPInstrumentor` | Yes | Wraps AIP/AAP calls automatically |
| **CF Workers adapter** | `@mnemom/aip-otel-exporter/workers` | — | No | Cloudflare Workers edge runtime |

## Quick Start

### TypeScript

```bash
npm install @mnemom/aip-otel-exporter @opentelemetry/api
```

```typescript
import { createAIPOTelRecorder } from "@mnemom/aip-otel-exporter";

const recorder = createAIPOTelRecorder({ tracerProvider });

recorder.recordIntegrityCheck(signal);    // AIP integrity check → span
recorder.recordVerification(result);       // AAP verification → span
recorder.recordCoherence(result);          // AAP coherence → span
recorder.recordDrift(alerts, count);       // AAP drift detection → span
```

### Python

```bash
pip install aip-otel-exporter[otel]
```

```python
from aip_otel_exporter import AIPOTelRecorder

recorder = AIPOTelRecorder(tracer_provider=provider)

recorder.record_integrity_check(signal)
recorder.record_verification(result)
recorder.record_coherence(result)
recorder.record_drift(alerts, traces_analyzed=50)
```

## Span Hierarchy

Spans are created as children of the current active span via `context.active()`:

```
your_application_span
  ├── aip.integrity_check
  │    ├── event: aip.concern (one per concern)
  │    └── event: aip.drift_alert (when drift active)
  ├── aap.verify_trace
  │    └── event: aap.violation (one per violation)
  ├── aap.check_coherence
  └── aap.detect_drift
       └── event: aap.drift_alert (one per alert)
```

## Attributes Reference

### `aip.integrity_check` — 22 attributes + 2 GenAI SIG aliases

| Attribute | Type | Source |
|---|---|---|
| `aip.integrity.checkpoint_id` | string | checkpoint |
| `aip.integrity.verdict` | string | checkpoint (clear / review_needed / boundary_violation) |
| `aip.integrity.agent_id` | string | checkpoint |
| `aip.integrity.card_id` | string | checkpoint |
| `aip.integrity.session_id` | string | checkpoint |
| `aip.integrity.thinking_hash` | string | checkpoint (SHA-256) |
| `aip.integrity.proceed` | boolean | signal |
| `aip.integrity.recommended_action` | string | signal |
| `aip.integrity.concerns_count` | int | signal |
| `aip.integrity.analysis_model` | string | analysis_metadata |
| `aip.integrity.analysis_duration_ms` | float | analysis_metadata |
| `aip.integrity.thinking_tokens` | int | analysis_metadata |
| `aip.integrity.truncated` | boolean | analysis_metadata |
| `aip.integrity.extraction_confidence` | float | analysis_metadata |
| `aip.conscience.consultation_depth` | string | conscience_context |
| `aip.conscience.values_checked_count` | int | conscience_context |
| `aip.conscience.conflicts_count` | int | conscience_context |
| `aip.window.size` | int | window_summary |
| `aip.window.integrity_ratio` | float | window_summary (0.0–1.0) |
| `aip.window.drift_alert_active` | boolean | window_summary |
| `gen_ai.evaluation.verdict` | string | GenAI SIG forward-compat |
| `gen_ai.evaluation.score` | float | GenAI SIG forward-compat |

### `aap.verify_trace` — 8 attributes

| Attribute | Type |
|---|---|
| `aap.verification.result` | boolean |
| `aap.verification.similarity_score` | float |
| `aap.verification.violations_count` | int |
| `aap.verification.warnings_count` | int |
| `aap.verification.trace_id` | string |
| `aap.verification.card_id` | string |
| `aap.verification.duration_ms` | float |
| `aap.verification.checks_performed` | string (comma-separated) |

### `aap.check_coherence` — 5 attributes

| Attribute | Type |
|---|---|
| `aap.coherence.compatible` | boolean |
| `aap.coherence.score` | float (0.0–1.0) |
| `aap.coherence.proceed` | boolean |
| `aap.coherence.matched_count` | int |
| `aap.coherence.conflict_count` | int |

### `aap.detect_drift` — 2 attributes

| Attribute | Type |
|---|---|
| `aap.drift.alerts_count` | int |
| `aap.drift.traces_analyzed` | int |

## Metrics

9 metric instruments for aggregate monitoring:

| Metric | Type | Labels |
|---|---|---|
| `aip.integrity_checks.total` | Counter | verdict, agent_id |
| `aip.concerns.total` | Counter | category, severity |
| `aip.analysis.duration_ms` | Histogram | verdict |
| `aip.window.integrity_ratio` | Histogram | — |
| `aip.drift_alerts.total` | Counter | — |
| `aap.verifications.total` | Counter | verified |
| `aap.violations.total` | Counter | type, severity |
| `aap.verification.duration_ms` | Histogram | — |
| `aap.coherence.score` | Histogram | compatible |

## Dashboard Templates

Pre-built dashboards in `packages/typescript/dashboards/`:

- **grafana-aip-overview.json** — Fleet-wide integrity monitoring
- **grafana-aip-detail.json** — Per-agent deep-dive
- **datadog-aip-overview.json** — Datadog importable dashboard

See [`dashboards/README.md`](packages/typescript/dashboards/README.md) for import instructions.

## Platform Examples

Integration examples in `packages/typescript/examples/`:

| Platform | File |
|---|---|
| Langfuse | `langfuse.ts` |
| Arize Phoenix | `arize-phoenix.ts` |
| Datadog | `datadog.ts` |
| Cloudflare Workers | `cloudflare-workers.ts` |

## Design Principles

- **Duck-typed inputs** — No hard dependency on AIP/AAP packages. Works with any compatible shape.
- **Graceful degradation** — Missing fields are silently skipped, never throws.
- **Zero-overhead Workers** — CF Workers adapter uses only `fetch()` + `crypto`, no OTel SDK.
- **GenAI SIG forward-compat** — `gen_ai.evaluation.*` aliases for future OTel GenAI SIG alignment.

## Documentation

| Document | Description |
|---|---|
| [CHANGELOG.md](CHANGELOG.md) | Release history |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Development setup and contribution guide |
| [docs/SECURITY.md](docs/SECURITY.md) | Security policy and threat model |
| [TypeScript README](packages/typescript/README.md) | TypeScript package documentation |
| [Python README](packages/python/README.md) | Python package documentation |
| [Dashboards README](packages/typescript/dashboards/README.md) | Dashboard import instructions |

## Status

**Version 0.1.0** — Initial release.

| Component | Status |
|---|---|
| TypeScript Manual API | Stable |
| TypeScript Auto-instrumentation | Stable |
| TypeScript Workers Adapter | Stable |
| Python Manual API | Stable |
| Python Auto-instrumentation | Stable |
| Metrics API | Stable |
| Dashboard Templates | Stable |

## Standards Alignment

The exporter follows [OpenTelemetry Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/)
for span naming and attribute structure. Forward-compatible aliases (`gen_ai.evaluation.*`) track
the emerging [OTel GenAI SIG](https://github.com/open-telemetry/semantic-conventions/tree/main/docs/gen-ai)
conventions for AI/ML observability.

This exporter is part of the [Mnemom](https://mnemom.ai) trust infrastructure:

- **[AIP](https://github.com/mnemom/aip)** — Agent Integrity Protocol (real-time thinking analysis)
- **[AAP](https://github.com/mnemom/aap)** — Agent Alignment Protocol (behavioral verification)
- **aip-otel-exporter** — This package (observability bridge)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, testing, and pull request guidelines.

## License

[Apache 2.0](LICENSE) — Copyright 2026 Mnemom LLC
