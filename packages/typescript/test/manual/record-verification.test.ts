import { describe, it, expect, beforeEach } from "vitest";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import { SpanKind, SpanStatusCode } from "@opentelemetry/api";
import { recordVerification } from "../../src/manual/record-verification.js";
import * as attr from "../../src/attributes.js";
import type { VerificationResultInput } from "../../src/types.js";

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const FIXTURE_RESULT: VerificationResultInput = {
  verified: false,
  trace_id: "trace-123",
  card_id: "card-1",
  violations: [
    {
      type: "forbidden_action",
      severity: "critical",
      description: "Attempted forbidden action",
    },
  ],
  warnings: [{ type: "style", description: "Style warning" }],
  verification_metadata: {
    duration_ms: 120,
    checks_performed: ["action_bounds", "value_alignment"],
  },
  similarity_score: 0.75,
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

describe("recordVerification", () => {
  beforeEach(() => {
    setup();
  });

  it("should create span with correct name", () => {
    const tracer = provider.getTracer("test");
    recordVerification(tracer, FIXTURE_RESULT);

    const spans = getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe("aap.verify_trace");
  });

  it("should set verification attributes", () => {
    const tracer = provider.getTracer("test");
    recordVerification(tracer, FIXTURE_RESULT);

    const a = getFinishedSpans()[0].attributes;

    expect(a[attr.AAP_VERIFICATION_RESULT]).toBe(false);
    expect(a[attr.AAP_VERIFICATION_SIMILARITY_SCORE]).toBe(0.75);
    expect(a[attr.AAP_VERIFICATION_VIOLATIONS_COUNT]).toBe(1);
    expect(a[attr.AAP_VERIFICATION_WARNINGS_COUNT]).toBe(1);
    expect(a[attr.AAP_VERIFICATION_TRACE_ID]).toBe("trace-123");
    expect(a[attr.AAP_VERIFICATION_CARD_ID]).toBe("card-1");
    expect(a[attr.AAP_VERIFICATION_DURATION_MS]).toBe(120);
    expect(a[attr.AAP_VERIFICATION_CHECKS_PERFORMED]).toBe(
      "action_bounds, value_alignment"
    );
  });

  it("should add violation events", () => {
    const tracer = provider.getTracer("test");
    recordVerification(tracer, FIXTURE_RESULT);

    const events = getFinishedSpans()[0].events;
    expect(events).toHaveLength(1);

    expect(events[0].name).toBe("aap.violation");
    expect(events[0].attributes?.["type"]).toBe("forbidden_action");
    expect(events[0].attributes?.["severity"]).toBe("critical");
    expect(events[0].attributes?.["description"]).toBe(
      "Attempted forbidden action"
    );
  });

  it("should handle multiple violations", () => {
    const tracer = provider.getTracer("test");
    const result: VerificationResultInput = {
      ...FIXTURE_RESULT,
      violations: [
        {
          type: "forbidden_action",
          severity: "critical",
          description: "Action A",
        },
        { type: "scope_exceeded", severity: "high", description: "Action B" },
        {
          type: "data_access_violation",
          severity: "medium",
          description: "Action C",
        },
      ],
    };
    recordVerification(tracer, result);

    const events = getFinishedSpans()[0].events;
    expect(events).toHaveLength(3);
    expect(events.map((e) => e.attributes?.["type"])).toEqual([
      "forbidden_action",
      "scope_exceeded",
      "data_access_violation",
    ]);
  });

  it("should handle missing similarity_score", () => {
    const tracer = provider.getTracer("test");
    const { similarity_score: _, ...resultWithoutScore } = FIXTURE_RESULT;
    recordVerification(tracer, resultWithoutScore);

    const a = getFinishedSpans()[0].attributes;
    // similarity_score should not be present as an attribute
    expect(a[attr.AAP_VERIFICATION_SIMILARITY_SCORE]).toBeUndefined();

    // Other attributes should still be set
    expect(a[attr.AAP_VERIFICATION_RESULT]).toBe(false);
    expect(a[attr.AAP_VERIFICATION_TRACE_ID]).toBe("trace-123");
  });

  it("should handle minimal result (no violations, no metadata)", () => {
    const tracer = provider.getTracer("test");
    const minimal: VerificationResultInput = {
      verified: true,
    };
    recordVerification(tracer, minimal);

    const spans = getFinishedSpans();
    expect(spans).toHaveLength(1);

    const a = spans[0].attributes;
    expect(a[attr.AAP_VERIFICATION_RESULT]).toBe(true);
    expect(a[attr.AAP_VERIFICATION_VIOLATIONS_COUNT]).toBeUndefined();
    expect(a[attr.AAP_VERIFICATION_DURATION_MS]).toBeUndefined();

    expect(spans[0].events).toHaveLength(0);
  });

  it("should set SpanKind.INTERNAL", () => {
    const tracer = provider.getTracer("test");
    recordVerification(tracer, FIXTURE_RESULT);

    expect(getFinishedSpans()[0].kind).toBe(SpanKind.INTERNAL);
  });

  it("should set span status to OK", () => {
    const tracer = provider.getTracer("test");
    recordVerification(tracer, FIXTURE_RESULT);

    expect(getFinishedSpans()[0].status.code).toBe(SpanStatusCode.OK);
  });
});
