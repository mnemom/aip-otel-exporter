"""AIP OTel Exporter -- OpenTelemetry instrumentation for AIP and AAP."""

from __future__ import annotations

from .manual import (
    record_coherence,
    record_drift,
    record_integrity_check,
    record_verification,
)
from .span_builder import build_span

__all__ = [
    "record_integrity_check",
    "record_verification",
    "record_coherence",
    "record_drift",
    "build_span",
    "AIPOTelRecorder",
    "AIPInstrumentor",
]


class AIPOTelRecorder:
    """Convenience class wrapping manual recording functions.

    Holds a single ``Tracer`` and delegates to the four ``record_*`` module
    functions so callers do not need to pass the tracer explicitly each time.
    """

    def __init__(
        self,
        tracer_provider=None,
        tracer_name: str = "aip-otel-exporter",
    ) -> None:
        from opentelemetry import trace

        self._tracer = trace.get_tracer(tracer_name, tracer_provider=tracer_provider)

    def record_integrity_check(self, signal):
        """Record an AIP integrity check as an OTel span."""
        return record_integrity_check(self._tracer, signal)

    def record_verification(self, result):
        """Record an AAP verification result as an OTel span."""
        return record_verification(self._tracer, result)

    def record_coherence(self, result):
        """Record an AAP coherence check as an OTel span."""
        return record_coherence(self._tracer, result)

    def record_drift(self, alerts, traces_analyzed: int = 0):
        """Record AAP drift detection as an OTel span."""
        return record_drift(self._tracer, alerts, traces_analyzed)


# Lazy import for AIPInstrumentor since opentelemetry-instrumentation is an
# optional dependency.
def __getattr__(name: str):
    if name == "AIPInstrumentor":
        try:
            from .instrumentor import AIPInstrumentor

            return AIPInstrumentor
        except ImportError as exc:
            raise ImportError(
                "AIPInstrumentor requires the 'opentelemetry-instrumentation' "
                "package. Install it with: pip install opentelemetry-instrumentation"
            ) from exc
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
