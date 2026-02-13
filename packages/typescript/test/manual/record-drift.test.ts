import { describe, it, expect, beforeEach } from "vitest";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import { SpanKind, SpanStatusCode } from "@opentelemetry/api";
import { recordDrift } from "../../src/manual/record-drift.js";
import * as attr from "../../src/attributes.js";
import type { DriftAlertInput } from "../../src/types.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FIXTURE_ALERTS: DriftAlertInput[] = [
  {
    alert_type: "behavioral_drift",
    agent_id: "agent-1",
    card_id: "card-1",
    analysis: {
      similarity_score: 0.45,
      drift_direction: "restrictive",
      sustained_traces: 10,
    },
    recommendation: "review_card",
  },
  {
    alert_type: "value_drift",
    agent_id: "agent-2",
    card_id: "card-2",
    analysis: {
      similarity_score: 0.3,
      drift_direction: "permissive",
      sustained_traces: 5,
    },
    recommendation: "alert_operator",
  },
];

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

describe("recordDrift", () => {
  beforeEach(() => {
    setup();
  });

  it("should create span with correct name", () => {
    const tracer = provider.getTracer("test");
    recordDrift(tracer, FIXTURE_ALERTS, 50);

    const spans = getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe("aap.detect_drift");
  });

  it("should set drift attributes", () => {
    const tracer = provider.getTracer("test");
    recordDrift(tracer, FIXTURE_ALERTS, 50);

    const a = getFinishedSpans()[0].attributes;
    expect(a[attr.AAP_DRIFT_ALERTS_COUNT]).toBe(2);
    expect(a[attr.AAP_DRIFT_TRACES_ANALYZED]).toBe(50);
  });

  it("should emit one event per alert", () => {
    const tracer = provider.getTracer("test");
    recordDrift(tracer, FIXTURE_ALERTS, 50);

    const events = getFinishedSpans()[0].events;
    expect(events).toHaveLength(2);

    // First alert event
    expect(events[0].name).toBe("aap.drift_alert");
    expect(events[0].attributes?.["alert_type"]).toBe("behavioral_drift");
    expect(events[0].attributes?.["agent_id"]).toBe("agent-1");
    expect(events[0].attributes?.["card_id"]).toBe("card-1");
    expect(events[0].attributes?.["similarity_score"]).toBe(0.45);
    expect(events[0].attributes?.["drift_direction"]).toBe("restrictive");
    expect(events[0].attributes?.["recommendation"]).toBe("review_card");

    // Second alert event
    expect(events[1].name).toBe("aap.drift_alert");
    expect(events[1].attributes?.["alert_type"]).toBe("value_drift");
    expect(events[1].attributes?.["agent_id"]).toBe("agent-2");
    expect(events[1].attributes?.["drift_direction"]).toBe("permissive");
    expect(events[1].attributes?.["recommendation"]).toBe("alert_operator");
  });

  it("should handle empty alerts array", () => {
    const tracer = provider.getTracer("test");
    recordDrift(tracer, [], 10);

    const spans = getFinishedSpans();
    expect(spans).toHaveLength(1);

    const a = spans[0].attributes;
    expect(a[attr.AAP_DRIFT_ALERTS_COUNT]).toBe(0);
    expect(a[attr.AAP_DRIFT_TRACES_ANALYZED]).toBe(10);
    expect(spans[0].events).toHaveLength(0);
  });

  it("should handle missing tracesAnalyzed", () => {
    const tracer = provider.getTracer("test");
    recordDrift(tracer, FIXTURE_ALERTS);

    const a = getFinishedSpans()[0].attributes;
    expect(a[attr.AAP_DRIFT_ALERTS_COUNT]).toBe(2);
    expect(a[attr.AAP_DRIFT_TRACES_ANALYZED]).toBeUndefined();
  });

  it("should handle alerts with missing optional fields", () => {
    const tracer = provider.getTracer("test");
    const sparseAlert: DriftAlertInput[] = [
      {
        alert_type: "behavioral_drift",
        // No agent_id, card_id, analysis, recommendation
      },
    ];
    recordDrift(tracer, sparseAlert, 1);

    const events = getFinishedSpans()[0].events;
    expect(events).toHaveLength(1);
    expect(events[0].attributes?.["alert_type"]).toBe("behavioral_drift");
    // Missing fields should not appear in event attributes
    expect(events[0].attributes?.["agent_id"]).toBeUndefined();
    expect(events[0].attributes?.["similarity_score"]).toBeUndefined();
    expect(events[0].attributes?.["drift_direction"]).toBeUndefined();
    expect(events[0].attributes?.["recommendation"]).toBeUndefined();
  });

  it("should set SpanKind.INTERNAL", () => {
    const tracer = provider.getTracer("test");
    recordDrift(tracer, FIXTURE_ALERTS, 50);

    expect(getFinishedSpans()[0].kind).toBe(SpanKind.INTERNAL);
  });

  it("should set span status to OK", () => {
    const tracer = provider.getTracer("test");
    recordDrift(tracer, FIXTURE_ALERTS, 50);

    expect(getFinishedSpans()[0].status.code).toBe(SpanStatusCode.OK);
  });
});
