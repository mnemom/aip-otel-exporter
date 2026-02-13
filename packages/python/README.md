# aip-otel-exporter

OpenTelemetry exporter for [AIP](https://github.com/mnemom/agent-integrity-protocol) integrity checkpoints and [AAP](https://github.com/mnemom/agent-alignment-protocol) verification results.

Python companion to `@mnemom/aip-otel-exporter`.

## Installation

```bash
pip install aip-otel-exporter[otel]    # with OpenTelemetry
pip install aip-otel-exporter[all]     # with all optional deps
```

## Quick Start

### Manual API

```python
from aip_otel_exporter import AIPOTelRecorder

recorder = AIPOTelRecorder()
recorder.record_integrity_check(signal)
recorder.record_verification(result)
```

### Auto-instrumentation

```python
from aip_otel_exporter import AIPInstrumentor

AIPInstrumentor().instrument()
```

## License

MIT
