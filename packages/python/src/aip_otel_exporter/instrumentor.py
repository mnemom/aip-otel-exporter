"""
BaseInstrumentor subclass for auto-instrumenting AIP and AAP client calls.

Wraps ``aip.client.AIPClient.check`` and ``aap.verification.verify_trace``
so that every call automatically records an OTel span via the manual
recording functions.

Requires ``opentelemetry-instrumentation`` as an optional dependency.
"""

from __future__ import annotations

import importlib
from typing import Any, Collection

from opentelemetry import trace
from opentelemetry.instrumentation.instrumentor import BaseInstrumentor

from .manual import record_integrity_check, record_verification


class AIPInstrumentor(BaseInstrumentor):
    """Auto-instruments AIP client ``check()`` and AAP ``verify_trace()`` calls."""

    _original_check: Any = None
    _original_verify: Any = None
    _aip_client_cls: Any = None
    _aap_verify_module: Any = None

    def instrumentation_dependencies(self) -> Collection[str]:
        return []

    def _instrument(self, **kwargs: Any) -> None:
        tracer_provider = kwargs.get("tracer_provider")
        tracer = trace.get_tracer(
            "aip-otel-exporter", tracer_provider=tracer_provider
        )

        # Try to import and wrap aip.client.AIPClient.check
        try:
            aip_client_mod = importlib.import_module("aip.client")
            aip_client_cls = getattr(aip_client_mod, "AIPClient", None)
            if aip_client_cls is not None:
                self._aip_client_cls = aip_client_cls
                AIPInstrumentor._original_check = aip_client_cls.check

                def wrapped_check(self_client: Any, *args: Any, **kw: Any) -> Any:
                    result = AIPInstrumentor._original_check(self_client, *args, **kw)
                    if result:
                        record_integrity_check(tracer, result)
                    return result

                aip_client_cls.check = wrapped_check
        except ImportError:
            pass

        # Try to import and wrap aap.verification.verify_trace
        try:
            aap_verify_mod = importlib.import_module("aap.verification")
            original_verify = getattr(aap_verify_mod, "verify_trace", None)
            if original_verify is not None:
                self._aap_verify_module = aap_verify_mod
                AIPInstrumentor._original_verify = original_verify

                def wrapped_verify(*args: Any, **kw: Any) -> Any:
                    result = AIPInstrumentor._original_verify(*args, **kw)
                    if result:
                        record_verification(tracer, result)
                    return result

                aap_verify_mod.verify_trace = wrapped_verify
        except ImportError:
            pass

    def _uninstrument(self, **kwargs: Any) -> None:
        # Restore original AIPClient.check
        if (
            self._aip_client_cls is not None
            and AIPInstrumentor._original_check is not None
        ):
            self._aip_client_cls.check = AIPInstrumentor._original_check
            AIPInstrumentor._original_check = None
            self._aip_client_cls = None

        # Restore original aap.verification.verify_trace
        if (
            self._aap_verify_module is not None
            and AIPInstrumentor._original_verify is not None
        ):
            self._aap_verify_module.verify_trace = AIPInstrumentor._original_verify
            AIPInstrumentor._original_verify = None
            self._aap_verify_module = None
