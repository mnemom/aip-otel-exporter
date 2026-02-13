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
    return { key, value: { stringValue: value } };
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
  return { key, value: { stringValue: String(value) } };
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
): OTLPSpan {
  const now = String(Date.now() * 1_000_000);

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
    startTimeUnixNano: now,
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
): string {
  const payload: OTLPExportPayload = {
    resourceSpans: [
      {
        resource: {
          attributes: toOTLPAttributes({ "service.name": serviceName }),
        },
        scopeSpans: [
          {
            scope: {
              name: "@mnemom/aip-otel-exporter",
              version: "0.1.0",
            },
            spans,
          },
        ],
      },
    ],
  };

  return JSON.stringify(payload);
}
