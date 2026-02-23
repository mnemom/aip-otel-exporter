/**
 * Shared span-building utility for the manual recording API.
 *
 * Provides a generic helper that:
 * - Starts a span with SpanKind.INTERNAL under the current active context
 * - Sets attributes (skipping undefined/null values)
 * - Adds events
 * - Ends the span and returns it
 */

import { SpanKind, SpanStatusCode, context, trace } from "@opentelemetry/api";
import type { Span, Tracer, Attributes } from "@opentelemetry/api";

/** Maximum length for string attribute values. Longer values are truncated. */
const MAX_ATTRIBUTE_LENGTH = 4096;

/**
 * Truncate a string value if it exceeds MAX_ATTRIBUTE_LENGTH.
 * Appends " [truncated]" to indicate the value was shortened.
 */
function truncateIfNeeded(value: string): string {
  if (value.length > MAX_ATTRIBUTE_LENGTH) {
    return value.slice(0, MAX_ATTRIBUTE_LENGTH - 12) + " [truncated]";
  }
  return value;
}

/**
 * Set attributes on a span, skipping any whose value is undefined or null.
 * String values exceeding MAX_ATTRIBUTE_LENGTH are truncated.
 */
export function setOptionalAttributes(
  span: Span,
  attrs: Record<string, unknown>,
): void {
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== undefined && value !== null) {
      const safeValue = typeof value === "string" ? truncateIfNeeded(value) : value;
      span.setAttribute(key, safeValue as string | number | boolean);
    }
  }
}

/**
 * Build, populate, end, and return an OTel span.
 *
 * The span is created as a child of the current active span (via `context.active()`),
 * with `SpanKind.INTERNAL`. Attributes with undefined/null values are silently
 * dropped. Each entry in `events` produces a span event with optional attributes.
 * The span is ended before being returned so callers can still read its data but
 * the timing is captured immediately.
 */
export function buildSpan(
  tracer: Tracer,
  spanName: string,
  attributes: Record<string, unknown>,
  events?: Array<{ name: string; attributes: Attributes }>,
): Span {
  const span = tracer.startSpan(
    spanName,
    { kind: SpanKind.INTERNAL },
    context.active(),
  );

  setOptionalAttributes(span, attributes);

  if (events) {
    for (const event of events) {
      span.addEvent(event.name, event.attributes);
    }
  }

  span.setStatus({ code: SpanStatusCode.OK });
  span.end();

  return span;
}
