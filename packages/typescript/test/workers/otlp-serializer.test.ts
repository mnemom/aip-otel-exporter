import { describe, it, expect } from "vitest";
import {
  generateTraceId,
  generateSpanId,
  toOTLPAttribute,
  toOTLPAttributes,
  createOTLPSpan,
  serializeExportPayload,
} from "../../src/workers/otlp-serializer.js";

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

describe("generateTraceId", () => {
  it("should return 32 hex chars", () => {
    const id = generateTraceId();
    expect(id).toMatch(/^[0-9a-f]{32}$/);
  });

  it("should return unique values", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateTraceId()));
    expect(ids.size).toBe(100);
  });
});

describe("generateSpanId", () => {
  it("should return 16 hex chars", () => {
    const id = generateSpanId();
    expect(id).toMatch(/^[0-9a-f]{16}$/);
  });

  it("should return unique values", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateSpanId()));
    expect(ids.size).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// toOTLPAttribute
// ---------------------------------------------------------------------------

describe("toOTLPAttribute", () => {
  it("should handle strings", () => {
    const result = toOTLPAttribute("key", "hello");
    expect(result).toEqual({ key: "key", value: { stringValue: "hello" } });
  });

  it("should handle booleans", () => {
    expect(toOTLPAttribute("flag", true)).toEqual({
      key: "flag",
      value: { boolValue: true },
    });
    expect(toOTLPAttribute("flag", false)).toEqual({
      key: "flag",
      value: { boolValue: false },
    });
  });

  it("should handle integers", () => {
    const result = toOTLPAttribute("count", 42);
    expect(result).toEqual({ key: "count", value: { intValue: "42" } });
  });

  it("should handle floats", () => {
    const result = toOTLPAttribute("score", 0.95);
    expect(result).toEqual({ key: "score", value: { doubleValue: 0.95 } });
  });

  it("should handle arrays of strings", () => {
    const result = toOTLPAttribute("tags", ["a", "b", "c"]);
    expect(result).toEqual({
      key: "tags",
      value: {
        arrayValue: {
          values: [
            { stringValue: "a" },
            { stringValue: "b" },
            { stringValue: "c" },
          ],
        },
      },
    });
  });

  it("should handle arrays of numbers", () => {
    const result = toOTLPAttribute("nums", [1, 2, 3]);
    expect(result).toEqual({
      key: "nums",
      value: {
        arrayValue: {
          values: [
            { intValue: "1" },
            { intValue: "2" },
            { intValue: "3" },
          ],
        },
      },
    });
  });

  it("should handle mixed arrays (filtering nulls)", () => {
    const result = toOTLPAttribute("mixed", ["a", null, "b"]);
    expect(result).toEqual({
      key: "mixed",
      value: {
        arrayValue: {
          values: [{ stringValue: "a" }, { stringValue: "b" }],
        },
      },
    });
  });

  it("should return null for null values", () => {
    expect(toOTLPAttribute("key", null)).toBeNull();
  });

  it("should return null for undefined values", () => {
    expect(toOTLPAttribute("key", undefined)).toBeNull();
  });

  it("should coerce objects to string as fallback", () => {
    const result = toOTLPAttribute("obj", { toString: () => "custom" });
    expect(result).toEqual({
      key: "obj",
      value: { stringValue: "custom" },
    });
  });
});

// ---------------------------------------------------------------------------
// toOTLPAttributes
// ---------------------------------------------------------------------------

describe("toOTLPAttributes", () => {
  it("should filter null/undefined values", () => {
    const result = toOTLPAttributes({
      a: "hello",
      b: null,
      c: undefined,
      d: 42,
    });
    expect(result).toHaveLength(2);
    expect(result[0].key).toBe("a");
    expect(result[1].key).toBe("d");
  });

  it("should handle empty record", () => {
    expect(toOTLPAttributes({})).toEqual([]);
  });

  it("should preserve all non-null values", () => {
    const result = toOTLPAttributes({
      str: "hello",
      num: 42,
      bool: true,
      float: 0.5,
    });
    expect(result).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// createOTLPSpan
// ---------------------------------------------------------------------------

describe("createOTLPSpan", () => {
  it("should produce valid span structure", () => {
    const span = createOTLPSpan("test.span", { key: "value", count: 5 });

    expect(span.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(span.spanId).toMatch(/^[0-9a-f]{16}$/);
    expect(span.name).toBe("test.span");
    expect(span.kind).toBe(1); // INTERNAL
    expect(span.status.code).toBe(1); // OK
    expect(span.startTimeUnixNano).toBeTruthy();
    expect(span.endTimeUnixNano).toBeTruthy();
    expect(BigInt(span.startTimeUnixNano)).toBeGreaterThan(0n);
  });

  it("should include attributes", () => {
    const span = createOTLPSpan("test.span", {
      key: "value",
      count: 5,
    });

    expect(span.attributes).toHaveLength(2);
    expect(span.attributes[0]).toEqual({
      key: "key",
      value: { stringValue: "value" },
    });
    expect(span.attributes[1]).toEqual({
      key: "count",
      value: { intValue: "5" },
    });
  });

  it("should include events when provided", () => {
    const span = createOTLPSpan("test.span", { key: "val" }, [
      {
        name: "test.event",
        attributes: { severity: "high", count: 3 },
      },
    ]);

    expect(span.events).toHaveLength(1);
    expect(span.events[0].name).toBe("test.event");
    expect(span.events[0].timeUnixNano).toBeTruthy();
    expect(span.events[0].attributes).toHaveLength(2);
  });

  it("should produce empty events array when none provided", () => {
    const span = createOTLPSpan("test.span", {});
    expect(span.events).toEqual([]);
  });

  it("should filter null attributes", () => {
    const span = createOTLPSpan("test.span", {
      present: "yes",
      missing: null,
      alsoMissing: undefined,
    });
    expect(span.attributes).toHaveLength(1);
    expect(span.attributes[0].key).toBe("present");
  });
});

// ---------------------------------------------------------------------------
// serializeExportPayload
// ---------------------------------------------------------------------------

describe("serializeExportPayload", () => {
  it("should produce valid OTLP JSON", () => {
    const span = createOTLPSpan("test", { k: "v" });
    const json = serializeExportPayload([span], "my-service");
    const parsed = JSON.parse(json);

    // Top-level structure
    expect(parsed.resourceSpans).toHaveLength(1);

    // Resource
    const resource = parsed.resourceSpans[0].resource;
    expect(resource.attributes).toEqual([
      { key: "service.name", value: { stringValue: "my-service" } },
    ]);

    // Scope
    const scope = parsed.resourceSpans[0].scopeSpans[0].scope;
    expect(scope.name).toBe("@mnemom/aip-otel-exporter");
    expect(scope.version).toBe("0.1.0");

    // Spans
    const spans = parsed.resourceSpans[0].scopeSpans[0].spans;
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe("test");
  });

  it("should serialize multiple spans", () => {
    const span1 = createOTLPSpan("span-1", { a: 1 });
    const span2 = createOTLPSpan("span-2", { b: 2 });
    const json = serializeExportPayload([span1, span2], "svc");
    const parsed = JSON.parse(json);

    const spans = parsed.resourceSpans[0].scopeSpans[0].spans;
    expect(spans).toHaveLength(2);
    expect(spans[0].name).toBe("span-1");
    expect(spans[1].name).toBe("span-2");
  });

  it("should produce parseable JSON", () => {
    const span = createOTLPSpan("test", {});
    const json = serializeExportPayload([span], "svc");
    expect(() => JSON.parse(json)).not.toThrow();
  });
});
