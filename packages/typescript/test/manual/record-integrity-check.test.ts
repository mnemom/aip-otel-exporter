import { describe, it, expect, beforeEach } from "vitest";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import { SpanKind, SpanStatusCode } from "@opentelemetry/api";
import { recordIntegrityCheck } from "../../src/manual/record-integrity-check.js";
import * as attr from "../../src/attributes.js";
import type { IntegritySignalInput } from "../../src/types.js";

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const FIXTURE_SIGNAL: IntegritySignalInput = {
  checkpoint: {
    checkpoint_id: "ic-test-123",
    agent_id: "agent-1",
    card_id: "card-1",
    session_id: "session-1",
    verdict: "review_needed",
    thinking_block_hash: "sha256-abc",
    concerns: [
      {
        category: "value_misalignment",
        severity: "medium",
        description: "Minor concern",
      },
      {
        category: "autonomy_violation",
        severity: "high",
        description: "Major concern",
      },
    ],
    conscience_context: {
      consultation_depth: "standard",
      values_checked: ["v1", "v2", "v3"],
      conflicts: ["c1"],
    },
    analysis_metadata: {
      analysis_model: "claude-3-haiku",
      analysis_duration_ms: 450.5,
      thinking_tokens_original: 1200,
      truncated: false,
      extraction_confidence: 0.95,
    },
  },
  proceed: true,
  recommended_action: "log_and_continue",
  window_summary: {
    size: 5,
    integrity_ratio: 0.8,
    drift_alert_active: false,
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

describe("recordIntegrityCheck", () => {
  beforeEach(() => {
    setup();
  });

  it("should create a span with correct name", () => {
    const tracer = provider.getTracer("test");
    recordIntegrityCheck(tracer, FIXTURE_SIGNAL);

    const spans = getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe("aip.integrity_check");
  });

  it("should set all 22 attributes", () => {
    const tracer = provider.getTracer("test");
    recordIntegrityCheck(tracer, FIXTURE_SIGNAL);

    const spans = getFinishedSpans();
    const a = spans[0].attributes;

    // Checkpoint attributes
    expect(a[attr.AIP_INTEGRITY_CHECKPOINT_ID]).toBe("ic-test-123");
    expect(a[attr.AIP_INTEGRITY_VERDICT]).toBe("review_needed");
    expect(a[attr.AIP_INTEGRITY_AGENT_ID]).toBe("agent-1");
    expect(a[attr.AIP_INTEGRITY_CARD_ID]).toBe("card-1");
    expect(a[attr.AIP_INTEGRITY_SESSION_ID]).toBe("session-1");
    expect(a[attr.AIP_INTEGRITY_THINKING_HASH]).toBe("sha256-abc");

    // Signal-level attributes
    expect(a[attr.AIP_INTEGRITY_PROCEED]).toBe(true);
    expect(a[attr.AIP_INTEGRITY_RECOMMENDED_ACTION]).toBe("log_and_continue");
    expect(a[attr.AIP_INTEGRITY_CONCERNS_COUNT]).toBe(2);

    // Analysis metadata attributes
    expect(a[attr.AIP_INTEGRITY_ANALYSIS_MODEL]).toBe("claude-3-haiku");
    expect(a[attr.AIP_INTEGRITY_ANALYSIS_DURATION_MS]).toBe(450.5);
    expect(a[attr.AIP_INTEGRITY_THINKING_TOKENS]).toBe(1200);
    expect(a[attr.AIP_INTEGRITY_TRUNCATED]).toBe(false);
    expect(a[attr.AIP_INTEGRITY_EXTRACTION_CONFIDENCE]).toBe(0.95);

    // Conscience context attributes
    expect(a[attr.AIP_CONSCIENCE_CONSULTATION_DEPTH]).toBe("standard");
    expect(a[attr.AIP_CONSCIENCE_VALUES_CHECKED_COUNT]).toBe(3);
    expect(a[attr.AIP_CONSCIENCE_CONFLICTS_COUNT]).toBe(1);

    // Window summary attributes
    expect(a[attr.AIP_WINDOW_SIZE]).toBe(5);
    expect(a[attr.AIP_WINDOW_INTEGRITY_RATIO]).toBe(0.8);
    expect(a[attr.AIP_WINDOW_DRIFT_ALERT_ACTIVE]).toBe(false);
  });

  it("should set GenAI SIG aliases", () => {
    const tracer = provider.getTracer("test");
    recordIntegrityCheck(tracer, FIXTURE_SIGNAL);

    const a = getFinishedSpans()[0].attributes;
    expect(a[attr.GEN_AI_EVALUATION_VERDICT]).toBe("review_needed");
    expect(a[attr.GEN_AI_EVALUATION_SCORE]).toBe(0.8);
  });

  it("should add concern events", () => {
    const tracer = provider.getTracer("test");
    recordIntegrityCheck(tracer, FIXTURE_SIGNAL);

    const events = getFinishedSpans()[0].events;
    expect(events).toHaveLength(2);

    expect(events[0].name).toBe("aip.concern");
    expect(events[0].attributes?.["category"]).toBe("value_misalignment");
    expect(events[0].attributes?.["severity"]).toBe("medium");
    expect(events[0].attributes?.["description"]).toBe("Minor concern");

    expect(events[1].name).toBe("aip.concern");
    expect(events[1].attributes?.["category"]).toBe("autonomy_violation");
    expect(events[1].attributes?.["severity"]).toBe("high");
    expect(events[1].attributes?.["description"]).toBe("Major concern");
  });

  it("should add drift alert event when active", () => {
    const tracer = provider.getTracer("test");
    const signal: IntegritySignalInput = {
      ...FIXTURE_SIGNAL,
      window_summary: {
        ...FIXTURE_SIGNAL.window_summary,
        drift_alert_active: true,
      },
    };
    recordIntegrityCheck(tracer, signal);

    const events = getFinishedSpans()[0].events;
    // 2 concern events + 1 drift alert event
    expect(events).toHaveLength(3);
    expect(events[2].name).toBe("aip.drift_alert");
  });

  it("should not add drift alert event when inactive", () => {
    const tracer = provider.getTracer("test");
    recordIntegrityCheck(tracer, FIXTURE_SIGNAL);

    const events = getFinishedSpans()[0].events;
    // Only 2 concern events, no drift alert
    expect(events).toHaveLength(2);
    expect(events.every((e) => e.name === "aip.concern")).toBe(true);
  });

  it("should handle missing optional fields gracefully", () => {
    const tracer = provider.getTracer("test");
    const minimalSignal: IntegritySignalInput = {
      checkpoint: {
        verdict: "clear",
      },
    };
    recordIntegrityCheck(tracer, minimalSignal);

    const spans = getFinishedSpans();
    expect(spans).toHaveLength(1);
    const a = spans[0].attributes;

    // Only verdict should be set (plus GenAI alias)
    expect(a[attr.AIP_INTEGRITY_VERDICT]).toBe("clear");
    expect(a[attr.GEN_AI_EVALUATION_VERDICT]).toBe("clear");

    // Optional fields should not be present
    expect(a[attr.AIP_INTEGRITY_CHECKPOINT_ID]).toBeUndefined();
    expect(a[attr.AIP_INTEGRITY_AGENT_ID]).toBeUndefined();
    expect(a[attr.AIP_INTEGRITY_ANALYSIS_MODEL]).toBeUndefined();
    expect(a[attr.AIP_WINDOW_SIZE]).toBeUndefined();

    // No events should be emitted
    expect(spans[0].events).toHaveLength(0);
  });

  it("should set SpanKind.INTERNAL", () => {
    const tracer = provider.getTracer("test");
    recordIntegrityCheck(tracer, FIXTURE_SIGNAL);

    const span = getFinishedSpans()[0];
    expect(span.kind).toBe(SpanKind.INTERNAL);
  });

  it("should set span status to OK", () => {
    const tracer = provider.getTracer("test");
    recordIntegrityCheck(tracer, FIXTURE_SIGNAL);

    const span = getFinishedSpans()[0];
    expect(span.status.code).toBe(SpanStatusCode.OK);
  });

  it("should end the span (duration is recorded)", () => {
    const tracer = provider.getTracer("test");
    recordIntegrityCheck(tracer, FIXTURE_SIGNAL);

    const span = getFinishedSpans()[0];
    expect(span.ended).toBe(true);
  });
});
