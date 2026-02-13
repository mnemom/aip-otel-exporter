# aip-otel-exporter

[![PyPI](https://img.shields.io/pypi/v/aip-otel-exporter)](https://pypi.org/project/aip-otel-exporter/)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](../../LICENSE)

OpenTelemetry exporter for [AIP](https://github.com/mnemom/aip) integrity checkpoints and
[AAP](https://github.com/mnemom/aap) verification results.

Python companion to [`@mnemom/aip-otel-exporter`](../typescript/README.md).

## Installation

```bash
pip install aip-otel-exporter[otel]    # with OpenTelemetry SDK
pip install aip-otel-exporter[auto]    # with auto-instrumentation support
pip install aip-otel-exporter[all]     # all optional dependencies
```

## Quick Start

### Manual API

```python
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor, ConsoleSpanExporter

from aip_otel_exporter import AIPOTelRecorder

# Set up OTel
provider = TracerProvider()
provider.add_span_processor(SimpleSpanProcessor(ConsoleSpanExporter()))

# Create recorder
recorder = AIPOTelRecorder(tracer_provider=provider)

# After an AIP integrity check:
recorder.record_integrity_check(signal)

# After an AAP verification:
recorder.record_verification(result)

# After an AAP coherence check:
recorder.record_coherence(result)

# After AAP drift detection:
recorder.record_drift(alerts, traces_analyzed=50)
```

### Auto-instrumentation

```python
from aip_otel_exporter import AIPInstrumentor

# Automatically wraps AIP/AAP functions to record spans
AIPInstrumentor().instrument()

# Now AIP/AAP calls are automatically traced:
# from aip import AIPClient
# signal = client.check(thinking_block, card)
# ^^^ span is recorded automatically
```

### Direct Functions

For fine-grained control, use the recording functions directly:

```python
from opentelemetry import trace
from aip_otel_exporter.manual import (
    record_integrity_check,
    record_verification,
    record_coherence,
    record_drift,
)

tracer = trace.get_tracer("my-app")
record_integrity_check(tracer, signal)
record_verification(tracer, result)
```

## Span Hierarchy

Spans are created as children of the current active span:

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

## Attributes

### `aip.integrity_check` span — 22 attributes + 2 GenAI SIG aliases

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
| `aip.window.integrity_ratio` | float | Integrity ratio (0.0–1.0) |
| `aip.window.drift_alert_active` | boolean | Drift alert active |
| `gen_ai.evaluation.verdict` | string | GenAI SIG forward-compat alias |
| `gen_ai.evaluation.score` | float | GenAI SIG forward-compat alias |

### `aap.verify_trace` span — 8 attributes

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

### `aap.check_coherence` span — 5 attributes

| Attribute | Type |
|---|---|
| `aap.coherence.compatible` | boolean |
| `aap.coherence.score` | float |
| `aap.coherence.proceed` | boolean |
| `aap.coherence.matched_count` | int |
| `aap.coherence.conflict_count` | int |

### `aap.detect_drift` span — 2 attributes

| Attribute | Type |
|---|---|
| `aap.drift.alerts_count` | int |
| `aap.drift.traces_analyzed` | int |

## Metrics

```python
from aip_otel_exporter.metrics import (
    create_aip_metrics,
    record_integrity_metrics,
    record_verification_metrics,
    record_coherence_metrics,
    record_drift_metrics,
)

metrics = create_aip_metrics(meter_provider)
record_integrity_metrics(metrics, signal)
```

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

## Requirements

- Python >= 3.9
- OpenTelemetry SDK >= 1.20.0 (for `[otel]` extra)

## License

[Apache 2.0](../../LICENSE)
