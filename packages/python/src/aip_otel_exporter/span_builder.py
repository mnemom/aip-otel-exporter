"""
Shared span-building utility for the manual recording API.

Provides a generic helper that:
- Starts a span with SpanKind.INTERNAL under the current active context
- Sets attributes (skipping None values)
- Adds events
- Ends the span and returns it
"""

from __future__ import annotations

from typing import Any

from opentelemetry import context, trace
from opentelemetry.trace import SpanKind, StatusCode


def set_optional_attributes(
    span: trace.Span,
    attrs: dict[str, Any],
) -> None:
    """Set attributes on a span, skipping any whose value is None."""
    for key, value in attrs.items():
        if value is not None:
            span.set_attribute(key, value)


def build_span(
    tracer: trace.Tracer,
    span_name: str,
    attributes: dict[str, Any],
    events: list[dict[str, Any]] | None = None,
) -> trace.Span:
    """
    Build, populate, end, and return an OTel span.

    The span is created as a child of the current active span (via
    ``context.get_current()``), with ``SpanKind.INTERNAL``. Attributes whose
    values are None are silently dropped. Each entry in *events* produces a
    span event with optional attributes. The span is ended before being
    returned so callers can still read its data but the timing is captured
    immediately.

    Args:
        tracer: The OTel Tracer to use.
        span_name: Name for the span.
        attributes: Mapping of attribute names to values; None values are
            skipped.
        events: Optional list of dicts with ``"name"`` and ``"attributes"``
            keys.

    Returns:
        The ended Span instance.
    """
    span = tracer.start_span(
        span_name,
        kind=SpanKind.INTERNAL,
        context=context.get_current(),
    )

    set_optional_attributes(span, attributes)

    if events:
        for event in events:
            span.add_event(event["name"], attributes=event.get("attributes", {}))

    span.set_status(StatusCode.OK)
    span.end()

    return span
