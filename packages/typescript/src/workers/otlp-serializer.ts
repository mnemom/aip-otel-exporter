/**
 * OTLP JSON serialization utilities for Cloudflare Workers.
 *
 * Builds OTLP-compatible JSON payloads directly without any dependency on the
 * OpenTelemetry SDK.  Uses only `crypto.getRandomValues` (available in CF
 * Workers) for ID generation and `Date.now()` for timestamps.
 */

// ---------------------------------------------------------------------------
// OTLP JSON wire types
// ---------------------------------------------------------------------------

export type OTLPAttributeValue =
  | { stringValue: string }
  | { intValue: string }
  | { doubleValue: number }
  | { boolValue: boolean }
  | { arrayValue: { values: OTLPAttributeValue[] } };

export interface OTLPAttribute {
  key: string;
  value: OTLPAttributeValue;
}

export interface OTLPEvent {
  name: string;
  timeUnixNano: string;
  attributes: OTLPAttribute[];
}

export interface OTLPSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: number;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: OTLPAttribute[];
  events: OTLPEvent[];
  status: { code: number };
}

export interface OTLPExportPayload {
  resourceSpans: [
    {
      resource: { attributes: OTLPAttribute[] };
      scopeSpans: [
        {
          scope: { name: string; version: string };
          spans: OTLPSpan[];
        },
      ];
    },
  ];
}

// ---------------------------------------------------------------------------
// ID generation (CF Workers-compatible)
// ---------------------------------------------------------------------------

function hexFromBytes(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

/** Generate a 32-character hex trace ID. */
export function generateTraceId(): string {
  return hexFromBytes(crypto.getRandomValues(new Uint8Array(16)));
}

/** Generate a 16-character hex span ID. */
export function generateSpanId(): string {
  return hexFromBytes(crypto.getRandomValues(new Uint8Array(8)));
}

// ---------------------------------------------------------------------------
// Attribute conversion
// ---------------------------------------------------------------------------

/** Maximum length for string attribute values. Longer values are truncated. */
export const MAX_ATTRIBUTE_LENGTH = 4096;

/**
 * Truncate a string value if it exceeds MAX_ATTRIBUTE_LENGTH.
 * Appends " [truncated]" to indicate the value was shortened.
 */
export function truncateIfNeeded(value: string): string {
  if (value.length > MAX_ATTRIBUTE_LENGTH) {
    return value.slice(0, MAX_ATTRIBUTE_LENGTH - 12) + " [truncated]";
  }
  return value;
}

/**
 * Convert a single JS value to the OTLP attribute wire format.
 * Returns `null` for undefined / null values so callers can filter them out.
 */
export function toOTLPAttribute(
  key: string,
  value: unknown,
): OTLPAttribute | null {
  if (value === undefined || value === null) return null;

  if (typeof value === "string") {
    return { key, value: { stringValue: truncateIfNeeded(value) } };
  }
  if (typeof value === "boolean") {
    return { key, value: { boolValue: value } };
  }
  if (typeof value === "number") {
    if (Number.isInteger(value)) {
      return { key, value: { intValue: String(value) } };
    }
    return { key, value: { doubleValue: value } };
  }
  if (Array.isArray(value)) {
    const values: OTLPAttributeValue[] = [];
    for (const item of value) {
      const attr = toOTLPAttribute("", item);
      if (attr) values.push(attr.value);
    }
    return { key, value: { arrayValue: { values } } };
  }

  // Fallback: coerce to string
  return { key, value: { stringValue: truncateIfNeeded(String(value)) } };
}

/**
 * Batch-convert a record of key/value pairs to OTLP attributes,
 * filtering out any whose value is undefined or null.
 */
export function toOTLPAttributes(
  attrs: Record<string, unknown>,
): OTLPAttribute[] {
  const result: OTLPAttribute[] = [];
  for (const [key, value] of Object.entries(attrs)) {
    const attr = toOTLPAttribute(key, value);
    if (attr) result.push(attr);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Span construction
// ---------------------------------------------------------------------------

/**
 * Create a fully populated OTLPSpan with generated IDs and the current timestamp.
 *
 * The span kind is always 1 (INTERNAL) and the status code is 1 (OK).
 */
export function createOTLPSpan(
  name: string,
  attributes: Record<string, unknown>,
  events?: Array<{ name: string; attributes: Record<string, unknown> }>,
  durationMs?: number | null,
): OTLPSpan {
  const endMs = Date.now();
  const now = String(endMs * 1_000_000);

  // A bare emission is one-shot (start == end => 0 wall-time), so the
  // metrics-generator's latency histogram records a degenerate ~0 for the span.
  // When the caller knows the real operation duration it passes `durationMs`:
  // we set startTimeUnixNano = end - durationMs so spanmetrics records a REAL
  // latency histogram (the same pattern the prover uses in `_build_otlp_span`).
  // A non-positive / non-finite duration falls back to the one-shot behavior.
  const startTimeUnixNano =
    typeof durationMs === "number" && Number.isFinite(durationMs) && durationMs > 0
      ? String(Math.round((endMs - durationMs) * 1_000_000))
      : now;

  const otlpEvents: OTLPEvent[] = [];
  if (events) {
    for (const event of events) {
      otlpEvents.push({
        name: event.name,
        timeUnixNano: now,
        attributes: toOTLPAttributes(event.attributes),
      });
    }
  }

  return {
    traceId: generateTraceId(),
    spanId: generateSpanId(),
    name,
    kind: 1, // INTERNAL
    startTimeUnixNano,
    endTimeUnixNano: now,
    attributes: toOTLPAttributes(attributes),
    events: otlpEvents,
    status: { code: 1 }, // OK
  };
}

// ---------------------------------------------------------------------------
// Export payload serialization
// ---------------------------------------------------------------------------

/**
 * Wrap an array of OTLPSpan objects in the full OTLP ResourceSpans envelope
 * and return the JSON string ready to POST.
 */
export function serializeExportPayload(
  spans: OTLPSpan[],
  serviceName: string,
  env?: string,
  cellId?: string,
): string {
  // Resource attributes. `env` is added (as both the OTel-SemConv
  // `deployment.environment` and the bare `env` key the Tempo
  // metrics-generator promotes to the `env` spanmetrics label) only when a
  // non-empty value is supplied — an unset/empty env emits no label rather
  // than a false default (MNE-720 / MNE-765). `cell_id` follows the same
  // pattern for the Cell Architecture sharding model: stamped (snake_case,
  // low-cardinality) only when supplied so AIP/AAP integrity-check spans also
  // carry it (full-coverage follow-up for MNE-892).
  const resourceAttributes: Record<string, unknown> = {
    "service.name": serviceName,
  };
  if (env) {
    resourceAttributes["deployment.environment"] = env;
    resourceAttributes["env"] = env;
  }
  if (cellId) {
    resourceAttributes["cell_id"] = cellId;
  }
  const payload: OTLPExportPayload = {
    resourceSpans: [
      {
        resource: {
          attributes: toOTLPAttributes(resourceAttributes),
        },
        scopeSpans: [
          {
            scope: {
              name: "@mnemom/aip-otel-exporter",
              version: "0.7.1",
            },
            spans,
          },
        ],
      },
    ],
  };

  return JSON.stringify(payload);
}
