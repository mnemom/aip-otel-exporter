import { describe, it, expect, beforeEach } from "vitest";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import { SpanKind, SpanStatusCode } from "@opentelemetry/api";
import { recordCoherence } from "../../src/manual/record-coherence.js";
import * as attr from "../../src/attributes.js";
import type { CoherenceResultInput } from "../../src/types.js";

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const FIXTURE_COHERENCE: CoherenceResultInput = {
  compatible: true,
  score: 0.92,
  proceed: true,
  value_alignment: {
    matched: ["integrity", "transparency", "autonomy"],
    conflicts: [
      {
        initiator_value: "speed",
        responder_value: "thoroughness",
        conflict_type: "priority",
        description: "Priority mismatch",
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// Setup helpers
// ---------------------------------------------------------------------------

let exporter: InMemorySpanExporter;
let provider: BasicTracerProvider;

function setup() {
  exporter = new InMemorySpanExporter();
  provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
}

function getFinishedSpans(): ReadableSpan[] {
  return exporter.getFinishedSpans();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("recordCoherence", () => {
  beforeEach(() => {
    setup();
  });

  it("should create span with correct name", () => {
    const tracer = provider.getTracer("test");
    recordCoherence(tracer, FIXTURE_COHERENCE);

    const spans = getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe("aap.check_coherence");
  });

  it("should set all 5 coherence attributes", () => {
    const tracer = provider.getTracer("test");
    recordCoherence(tracer, FIXTURE_COHERENCE);

    const a = getFinishedSpans()[0].attributes;

    expect(a[attr.AAP_COHERENCE_COMPATIBLE]).toBe(true);
    expect(a[attr.AAP_COHERENCE_SCORE]).toBe(0.92);
    expect(a[attr.AAP_COHERENCE_PROCEED]).toBe(true);
    expect(a[attr.AAP_COHERENCE_MATCHED_COUNT]).toBe(3);
    expect(a[attr.AAP_COHERENCE_CONFLICT_COUNT]).toBe(1);
  });

  it("should handle missing value_alignment", () => {
    const tracer = provider.getTracer("test");
    const result: CoherenceResultInput = {
      compatible: false,
      score: 0.3,
      proceed: false,
    };
    recordCoherence(tracer, result);

    const a = getFinishedSpans()[0].attributes;
    expect(a[attr.AAP_COHERENCE_COMPATIBLE]).toBe(false);
    expect(a[attr.AAP_COHERENCE_SCORE]).toBe(0.3);
    expect(a[attr.AAP_COHERENCE_PROCEED]).toBe(false);
    expect(a[attr.AAP_COHERENCE_MATCHED_COUNT]).toBeUndefined();
    expect(a[attr.AAP_COHERENCE_CONFLICT_COUNT]).toBeUndefined();
  });

  it("should handle empty value_alignment arrays", () => {
    const tracer = provider.getTracer("test");
    const result: CoherenceResultInput = {
      compatible: true,
      score: 1.0,
      proceed: true,
      value_alignment: {
        matched: [],
        conflicts: [],
      },
    };
    recordCoherence(tracer, result);

    const a = getFinishedSpans()[0].attributes;
    expect(a[attr.AAP_COHERENCE_MATCHED_COUNT]).toBe(0);
    expect(a[attr.AAP_COHERENCE_CONFLICT_COUNT]).toBe(0);
  });

  it("should handle minimal result", () => {
    const tracer = provider.getTracer("test");
    const minimal: CoherenceResultInput = {};
    recordCoherence(tracer, minimal);

    const spans = getFinishedSpans();
    expect(spans).toHaveLength(1);
    // All attributes should be undefined (skipped by setOptionalAttributes)
    const a = spans[0].attributes;
    expect(a[attr.AAP_COHERENCE_COMPATIBLE]).toBeUndefined();
    expect(a[attr.AAP_COHERENCE_SCORE]).toBeUndefined();
  });

  it("should set SpanKind.INTERNAL", () => {
    const tracer = provider.getTracer("test");
    recordCoherence(tracer, FIXTURE_COHERENCE);

    expect(getFinishedSpans()[0].kind).toBe(SpanKind.INTERNAL);
  });

  it("should set span status to OK", () => {
    const tracer = provider.getTracer("test");
    recordCoherence(tracer, FIXTURE_COHERENCE);

    expect(getFinishedSpans()[0].status.code).toBe(SpanStatusCode.OK);
  });

  it("should not emit any events", () => {
    const tracer = provider.getTracer("test");
    recordCoherence(tracer, FIXTURE_COHERENCE);

    expect(getFinishedSpans()[0].events).toHaveLength(0);
  });
});
