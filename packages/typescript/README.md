# @mnemom/aip-otel-exporter

[![npm](https://img.shields.io/npm/v/@mnemom/aip-otel-exporter)](https://www.npmjs.com/package/@mnemom/aip-otel-exporter)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](../../LICENSE)

OpenTelemetry exporter for [AIP](https://github.com/mnemom/aip) integrity checkpoints and [AAP](https://github.com/mnemom/aap) verification results.

Send AIP/AAP telemetry to any OTel-compatible observability platform (Langfuse, Arize Phoenix, Datadog, Grafana) with zero custom code.

## Three Layers

| Layer | Import | OTel SDK Required | Use Case |
|---|---|---|---|
| **Manual API** | `@mnemom/aip-otel-exporter` | Yes | Works everywhere with OTel SDK |
| **Auto-instrumentation** | `@mnemom/aip-otel-exporter/auto` | Yes | Wraps AIP/AAP calls automatically (Node.js) |
| **CF Workers adapter** | `@mnemom/aip-otel-exporter/workers` | No | Cloudflare Workers (no OTel SDK needed) |

## Installation

```bash
npm install @mnemom/aip-otel-exporter
# Peer dependency (optional — required for Manual API and Auto-instrumentation):
npm install @opentelemetry/api
```

## Quick Start

### Manual API

```typescript
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-base";
import { createAIPOTelRecorder } from "@mnemom/aip-otel-exporter";

const provider = new NodeTracerProvider();
// ... configure your OTLP exporter (Langfuse, Datadog, etc.)
provider.register();

const recorder = createAIPOTelRecorder({ tracerProvider: provider });

// After an AIP integrity check:
recorder.recordIntegrityCheck(signal);

// After an AAP verification:
recorder.recordVerification(result);

// After an AAP coherence check:
recorder.recordCoherence(result);

// After AAP drift detection:
recorder.recordDrift(alerts, tracesAnalyzed);
```

### Auto-instrumentation (Node.js)

```typescript
import { instrument } from "@mnemom/aip-otel-exporter/auto";

// Automatically wraps AIPClient.check() and verifyTrace()
instrument();
```

### Cloudflare Workers

```typescript
import { createWorkersExporter } from "@mnemom/aip-otel-exporter/workers";

export default {
  async fetch(request, env, ctx) {
    const exporter = createWorkersExporter({
      endpoint: env.OTLP_ENDPOINT,
      authorization: `Bearer ${env.OTLP_TOKEN}`,
    });

    // ... your handler logic ...
    exporter.recordIntegrityCheck(signal);

    ctx.waitUntil(exporter.flush());
    return new Response("OK");
  },
};
```

## Span Hierarchy

Integrity/alignment spans are children of the current active span:

```
invoke_agent (existing)
  └── aip.integrity_check (our span)
       ├── event: aip.concern (one per concern)
       └── event: aip.drift_alert (conditional)
  └── aap.verify_trace (our span)
       └── event: aap.violation (one per violation)
```

## Attributes

### `aip.integrity_check` span

| Attribute | Type | Description |
|---|---|---|
| `aip.integrity.checkpoint_id` | string | Checkpoint ID |
| `aip.integrity.verdict` | string | clear / review_needed / boundary_violation |
| `aip.integrity.proceed` | boolean | Whether to proceed |
| `aip.integrity.recommended_action` | string | Recommended action |
| `aip.integrity.concerns_count` | int | Number of concerns |
| `aip.integrity.agent_id` | string | Agent ID |
| `aip.integrity.card_id` | string | Alignment Card ID |
| `aip.integrity.session_id` | string | Session ID |
| `aip.integrity.thinking_hash` | string | SHA-256 of thinking block |
| `aip.integrity.analysis_model` | string | Analysis LLM model |
| `aip.integrity.analysis_duration_ms` | float | Analysis duration |
| `aip.integrity.thinking_tokens` | int | Original thinking tokens |
| `aip.integrity.truncated` | boolean | Whether thinking was truncated |
| `aip.integrity.extraction_confidence` | float | Extraction confidence |
| `aip.conscience.consultation_depth` | string | surface / standard / deep |
| `aip.conscience.values_checked_count` | int | Values checked count |
| `aip.conscience.conflicts_count` | int | Conflicts count |
| `aip.window.size` | int | Window size |
| `aip.window.integrity_ratio` | float | Integrity ratio (0.0-1.0) |
| `aip.window.drift_alert_active` | boolean | Drift alert active |
| `gen_ai.evaluation.verdict` | string | GenAI SIG alias |
| `gen_ai.evaluation.score` | float | GenAI SIG alias |

### `aap.verify_trace` span

| Attribute | Type |
|---|---|
| `aap.verification.result` | boolean |
| `aap.verification.similarity_score` | float |
| `aap.verification.violations_count` | int |
| `aap.verification.warnings_count` | int |
| `aap.verification.trace_id` | string |
| `aap.verification.card_id` | string |
| `aap.verification.duration_ms` | float |
| `aap.verification.checks_performed` | string |

## Metrics

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

Pre-built dashboards are included in the `dashboards/` directory:

- `grafana-aip-overview.json` — Grafana system overview
- `grafana-aip-detail.json` — Grafana per-agent deep-dive
- `datadog-aip-overview.json` — Datadog importable dashboard

See `dashboards/README.md` for import instructions.

## Performance

Measured via `npm run bench` (Vitest bench, Node 22, Apple M-series):

| Operation | Mean | p99 | Ops/sec |
|---|---|---|---|
| `recordIntegrityCheck()` | 0.007 ms | 0.023 ms | 142,540 |
| `recordVerification()` | 0.003 ms | 0.004 ms | 310,510 |
| `recordCoherence()` | 0.003 ms | 0.003 ms | 321,385 |
| `recordDrift()` | 0.003 ms | 0.007 ms | 295,807 |
| Workers `createOTLPSpan()` | 0.003 ms | 0.004 ms | 341,778 |
| Workers `serializeExportPayload()` | 0.004 ms | 0.006 ms | 234,860 |

All operations are sub-0.01ms mean. Zero measurable overhead on hot paths.

## License

[Apache 2.0](../../LICENSE)
