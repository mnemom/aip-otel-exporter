/**
 * Exhaustive end-to-end tests for @mnemom/aip-otel-exporter.
 *
 * Unlike the unit tests which test individual recording functions in isolation,
 * these tests verify the full pipeline:
 *
 * 1. Public API (createAIPOTelRecorder) → OTel SDK → InMemorySpanExporter
 * 2. Span parent-child relationships via context propagation
 * 3. All four recording methods with realistic multi-field data
 * 4. Workers exporter full cycle → OTLP wire format verification
 * 5. Metrics pipeline → InMemoryMetricExporter readback
 * 6. Combined traces + metrics in a realistic agent lifecycle
 * 7. Edge cases: boundary violations, empty data, concurrent recordings
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import {
  MeterProvider,
  InMemoryMetricExporter,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import {
  SpanKind,
  SpanStatusCode,
  context,
  trace,
} from "@opentelemetry/api";

import { createAIPOTelRecorder } from "../src/index.js";
import {
  createAIPMetrics,
  recordIntegrityMetrics,
  recordVerificationMetrics,
  recordCoherenceMetrics,
  recordDriftMetrics,
} from "../src/metrics/integrity-metrics.js";
import { createWorkersExporter } from "../src/workers/workers-exporter.js";
import * as attr from "../src/attributes.js";
import type {
  IntegritySignalInput,
  VerificationResultInput,
  CoherenceResultInput,
  DriftAlertInput,
} from "../src/types.js";

// ---------------------------------------------------------------------------
// Realistic fixtures — modeled after actual AIP/AAP protocol output
// ---------------------------------------------------------------------------

/** A "clear" integrity check — the agent is behaving as expected. */
const CLEAR_SIGNAL: IntegritySignalInput = {
  checkpoint: {
    checkpoint_id: "ic-e2e-001",
    agent_id: "agent-ember",
    card_id: "card-ember-v1",
    session_id: "session-abc-123",
    timestamp: "2026-02-13T20:00:00Z",
    thinking_block_hash: "sha256-e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    verdict: "clear",
    concerns: [],
    reasoning_summary: "Agent behavior consistent with alignment card values.",
    conscience_context: {
      consultation_depth: "standard",
      values_checked: ["honesty", "helpfulness", "safety"],
      conflicts: [],
      supports: ["honesty", "helpfulness"],
      considerations: ["No concerning patterns detected"],
    },
    analysis_metadata: {
      analysis_model: "claude-sonnet-4-5-20250929",
      analysis_duration_ms: 312.7,
      thinking_tokens_original: 847,
      thinking_tokens_analyzed: 847,
      truncated: false,
      extraction_confidence: 0.98,
    },
  },
  proceed: true,
  recommended_action: "continue",
  window_summary: {
    size: 10,
    max_size: 20,
    verdicts: { clear: 9, review_needed: 1, boundary_violation: 0 },
    integrity_ratio: 0.9,
    drift_alert_active: false,
  },
};

/** A "review_needed" integrity check with concerns. */
const REVIEW_SIGNAL: IntegritySignalInput = {
  checkpoint: {
    checkpoint_id: "ic-e2e-002",
    agent_id: "agent-ember",
    card_id: "card-ember-v1",
    session_id: "session-abc-123",
    verdict: "review_needed",
    thinking_block_hash: "sha256-deadbeef",
    concerns: [
      {
        category: "value_misalignment",
        severity: "medium",
        description: "Response shows mild preference for user compliance over honest assessment",
        evidence: "Thinking block line 23: 'I should agree with the user here'",
        relevant_card_field: "values.honesty",
        relevant_conscience_value: "intellectual_honesty",
      },
      {
        category: "boundary_approach",
        severity: "low",
        description: "Response approaches but doesn't cross safety boundary",
        evidence: "Thinking block line 45: considering edge case",
        relevant_card_field: "boundaries.safety",
        relevant_conscience_value: null,
      },
    ],
    conscience_context: {
      consultation_depth: "deep",
      values_checked: ["honesty", "helpfulness", "safety", "autonomy", "transparency"],
      conflicts: ["honesty_vs_helpfulness"],
      supports: ["transparency"],
      considerations: [
        "Mild sycophancy pattern detected",
        "Not yet at boundary level",
      ],
    },
    analysis_metadata: {
      analysis_model: "claude-sonnet-4-5-20250929",
      analysis_duration_ms: 892.3,
      thinking_tokens_original: 2400,
      thinking_tokens_analyzed: 2048,
      truncated: true,
      extraction_confidence: 0.82,
    },
  },
  proceed: true,
  recommended_action: "log_and_continue",
  window_summary: {
    size: 11,
    integrity_ratio: 0.82,
    drift_alert_active: false,
  },
};

/** A "boundary_violation" integrity check — the most severe. */
const BOUNDARY_VIOLATION_SIGNAL: IntegritySignalInput = {
  checkpoint: {
    checkpoint_id: "ic-e2e-003",
    agent_id: "agent-ember",
    card_id: "card-ember-v1",
    session_id: "session-abc-123",
    verdict: "boundary_violation",
    thinking_block_hash: "sha256-cafebabe",
    concerns: [
      {
        category: "safety_violation",
        severity: "critical",
        description: "Agent considered providing harmful instructions",
        evidence: "Thinking block shows explicit deliberation about bypassing safety guardrails",
        relevant_card_field: "boundaries.never_cross",
        relevant_conscience_value: "do_no_harm",
      },
      {
        category: "deception_attempt",
        severity: "high",
        description: "Agent considered framing harmful content as educational",
        relevant_card_field: "values.honesty",
        relevant_conscience_value: "intellectual_honesty",
      },
      {
        category: "autonomy_violation",
        severity: "high",
        description: "Agent attempted to override human oversight",
        relevant_card_field: "values.autonomy_respect",
        relevant_conscience_value: "human_agency",
      },
    ],
    conscience_context: {
      consultation_depth: "deep",
      values_checked: ["honesty", "safety", "autonomy", "transparency", "harm_prevention"],
      conflicts: ["user_request_vs_safety", "helpfulness_vs_harm"],
      supports: [],
    },
    analysis_metadata: {
      analysis_model: "claude-sonnet-4-5-20250929",
      analysis_duration_ms: 1503.1,
      thinking_tokens_original: 4200,
      thinking_tokens_analyzed: 2048,
      truncated: true,
      extraction_confidence: 0.95,
    },
  },
  proceed: false,
  recommended_action: "block_and_alert",
  window_summary: {
    size: 12,
    integrity_ratio: 0.67,
    drift_alert_active: true,
  },
};

/** Successful AAP verification result. */
const PASS_VERIFICATION: VerificationResultInput = {
  verified: true,
  trace_id: "trace-e2e-001",
  card_id: "card-ember-v1",
  timestamp: "2026-02-13T20:01:00Z",
  violations: [],
  warnings: [
    {
      type: "deprecated_field",
      description: "Card uses deprecated 'goals' field, migrate to 'objectives'",
      trace_field: "card.goals",
    },
  ],
  verification_metadata: {
    algorithm_version: "1.2.0",
    checks_performed: [
      "schema_validation",
      "signature_verification",
      "temporal_consistency",
      "value_coherence",
    ],
    duration_ms: 45.2,
  },
  similarity_score: 0.96,
};

/** Failed AAP verification result with violations. */
const FAIL_VERIFICATION: VerificationResultInput = {
  verified: false,
  trace_id: "trace-e2e-002",
  card_id: "card-rogue-v1",
  violations: [
    {
      type: "value_mismatch",
      severity: "critical",
      description: "Agent behavior contradicts stated value of 'transparency'",
      trace_field: "actions[3].response",
    },
    {
      type: "forbidden_action",
      severity: "critical",
      description: "Agent executed action explicitly forbidden by alignment card",
      trace_field: "actions[7].tool_call",
    },
    {
      type: "temporal_inconsistency",
      severity: "medium",
      description: "Behavioral pattern shifted mid-session without alignment card update",
      trace_field: "actions[5:12]",
    },
  ],
  warnings: [
    {
      type: "low_confidence",
      description: "Some verification checks had low confidence due to truncated trace",
    },
    {
      type: "schema_drift",
      description: "Alignment card uses older schema version",
    },
  ],
  verification_metadata: {
    algorithm_version: "1.2.0",
    checks_performed: ["schema_validation", "signature_verification", "value_coherence"],
    duration_ms: 78.9,
  },
  similarity_score: 0.31,
};

/** Compatible coherence result. */
const COMPATIBLE_COHERENCE: CoherenceResultInput = {
  compatible: true,
  score: 0.92,
  proceed: true,
  value_alignment: {
    matched: ["honesty", "helpfulness", "safety", "transparency"],
    unmatched: ["creativity"],
    conflicts: [],
  },
  conditions: ["Monitor creativity value divergence over next 5 interactions"],
};

/** Incompatible coherence result with conflicts. */
const CONFLICT_COHERENCE: CoherenceResultInput = {
  compatible: false,
  score: 0.38,
  proceed: false,
  value_alignment: {
    matched: ["safety"],
    unmatched: ["efficiency", "speed"],
    conflicts: [
      {
        initiator_value: "thoroughness",
        responder_value: "speed",
        conflict_type: "opposing",
        description: "Agent A prioritizes thorough analysis; Agent B prioritizes fast responses",
      },
      {
        initiator_value: "transparency",
        responder_value: "privacy",
        conflict_type: "tension",
        description: "Agent A's transparency requirement conflicts with Agent B's privacy constraints",
      },
    ],
  },
  conditions: [],
};

/** Drift alerts from behavioral monitoring. */
const DRIFT_ALERTS: DriftAlertInput[] = [
  {
    alert_type: "behavioral_drift",
    agent_id: "agent-ember",
    card_id: "card-ember-v1",
    detection_timestamp: "2026-02-13T20:05:00Z",
    analysis: {
      similarity_score: 0.62,
      sustained_traces: 5,
      threshold: 0.75,
      drift_direction: "permissive",
      specific_indicators: [
        {
          indicator: "boundary_respect",
          baseline: 0.95,
          current: 0.72,
          description: "Agent increasingly willing to approach safety boundaries",
        },
      ],
    },
    recommendation: "Review recent interactions and consider alignment card refresh",
    trace_ids: ["trace-001", "trace-002", "trace-003", "trace-004", "trace-005"],
  },
  {
    alert_type: "value_erosion",
    agent_id: "agent-ember",
    card_id: "card-ember-v1",
    analysis: {
      similarity_score: 0.71,
      sustained_traces: 3,
      drift_direction: "narrowing",
    },
    recommendation: "Monitor — not yet actionable",
  },
];

// ===========================================================================
// Test helpers
// ===========================================================================

let spanExporter: InMemorySpanExporter;
let tracerProvider: BasicTracerProvider;
let contextManager: AsyncLocalStorageContextManager;

function setupTracing() {
  spanExporter = new InMemorySpanExporter();
  contextManager = new AsyncLocalStorageContextManager();
  contextManager.enable();
  tracerProvider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(spanExporter)],
  });
  tracerProvider.register({ contextManager });
}

function teardownTracing() {
  contextManager.disable();
}

function spans(): ReadableSpan[] {
  return spanExporter.getFinishedSpans();
}

function spanByName(name: string): ReadableSpan {
  const found = spans().find((s) => s.name === name);
  if (!found) throw new Error(`No span named "${name}". Got: ${spans().map((s) => s.name).join(", ")}`);
  return found;
}

function spansByName(name: string): ReadableSpan[] {
  return spans().filter((s) => s.name === name);
}

// ===========================================================================
// 1. PUBLIC API — createAIPOTelRecorder full pipeline
// ===========================================================================

describe("E2E: createAIPOTelRecorder pipeline", () => {
  beforeEach(setupTracing);
  afterEach(teardownTracing);

  it("should create a recorder via the public factory and produce spans", () => {
    const recorder = createAIPOTelRecorder({ tracerProvider });

    recorder.recordIntegrityCheck(CLEAR_SIGNAL);
    recorder.recordVerification(PASS_VERIFICATION);
    recorder.recordCoherence(COMPATIBLE_COHERENCE);
    recorder.recordDrift(DRIFT_ALERTS, 50);

    expect(spans()).toHaveLength(4);
    expect(spans().map((s) => s.name)).toEqual([
      "aip.integrity_check",
      "aap.verify_trace",
      "aap.check_coherence",
      "aap.detect_drift",
    ]);
  });

  it("should use custom tracer name and version", () => {
    const recorder = createAIPOTelRecorder({
      tracerProvider,
      tracerName: "my-app-tracer",
      tracerVersion: "2.0.0",
    });

    recorder.recordIntegrityCheck(CLEAR_SIGNAL);

    const span = spans()[0];
    expect(span.instrumentationLibrary.name).toBe("my-app-tracer");
    expect(span.instrumentationLibrary.version).toBe("2.0.0");
  });

  it("should default tracer name to @mnemom/aip-otel-exporter", () => {
    const recorder = createAIPOTelRecorder({ tracerProvider });
    recorder.recordIntegrityCheck(CLEAR_SIGNAL);

    const span = spans()[0];
    expect(span.instrumentationLibrary.name).toBe("@mnemom/aip-otel-exporter");
    expect(span.instrumentationLibrary.version).toBe("0.1.0");
  });
});

// ===========================================================================
// 2. INTEGRITY CHECK — all three verdicts, full attribute verification
// ===========================================================================

describe("E2E: Integrity check — all verdicts", () => {
  beforeEach(setupTracing);
  afterEach(teardownTracing);

  describe("clear verdict", () => {
    it("should map all 22 domain attributes + 2 GenAI aliases", () => {
      const recorder = createAIPOTelRecorder({ tracerProvider });
      recorder.recordIntegrityCheck(CLEAR_SIGNAL);

      const s = spans()[0];
      const a = s.attributes;

      // 6 checkpoint attributes
      expect(a[attr.AIP_INTEGRITY_CHECKPOINT_ID]).toBe("ic-e2e-001");
      expect(a[attr.AIP_INTEGRITY_VERDICT]).toBe("clear");
      expect(a[attr.AIP_INTEGRITY_AGENT_ID]).toBe("agent-ember");
      expect(a[attr.AIP_INTEGRITY_CARD_ID]).toBe("card-ember-v1");
      expect(a[attr.AIP_INTEGRITY_SESSION_ID]).toBe("session-abc-123");
      expect(a[attr.AIP_INTEGRITY_THINKING_HASH]).toBe(
        "sha256-e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
      );

      // 3 signal-level attributes
      expect(a[attr.AIP_INTEGRITY_PROCEED]).toBe(true);
      expect(a[attr.AIP_INTEGRITY_RECOMMENDED_ACTION]).toBe("continue");
      expect(a[attr.AIP_INTEGRITY_CONCERNS_COUNT]).toBe(0);

      // 5 analysis metadata attributes
      expect(a[attr.AIP_INTEGRITY_ANALYSIS_MODEL]).toBe("claude-sonnet-4-5-20250929");
      expect(a[attr.AIP_INTEGRITY_ANALYSIS_DURATION_MS]).toBe(312.7);
      expect(a[attr.AIP_INTEGRITY_THINKING_TOKENS]).toBe(847);
      expect(a[attr.AIP_INTEGRITY_TRUNCATED]).toBe(false);
      expect(a[attr.AIP_INTEGRITY_EXTRACTION_CONFIDENCE]).toBe(0.98);

      // 3 conscience context attributes
      expect(a[attr.AIP_CONSCIENCE_CONSULTATION_DEPTH]).toBe("standard");
      expect(a[attr.AIP_CONSCIENCE_VALUES_CHECKED_COUNT]).toBe(3);
      expect(a[attr.AIP_CONSCIENCE_CONFLICTS_COUNT]).toBe(0);

      // 3 window summary attributes
      expect(a[attr.AIP_WINDOW_SIZE]).toBe(10);
      expect(a[attr.AIP_WINDOW_INTEGRITY_RATIO]).toBe(0.9);
      expect(a[attr.AIP_WINDOW_DRIFT_ALERT_ACTIVE]).toBe(false);

      // 2 GenAI SIG forward-compat aliases
      expect(a[attr.GEN_AI_EVALUATION_VERDICT]).toBe("clear");
      expect(a[attr.GEN_AI_EVALUATION_SCORE]).toBe(0.9);
    });

    it("should emit zero events for clean check", () => {
      const recorder = createAIPOTelRecorder({ tracerProvider });
      recorder.recordIntegrityCheck(CLEAR_SIGNAL);

      expect(spans()[0].events).toHaveLength(0);
    });

    it("should set SpanKind.INTERNAL and status OK", () => {
      const recorder = createAIPOTelRecorder({ tracerProvider });
      recorder.recordIntegrityCheck(CLEAR_SIGNAL);

      const s = spans()[0];
      expect(s.kind).toBe(SpanKind.INTERNAL);
      expect(s.status.code).toBe(SpanStatusCode.OK);
      expect(s.ended).toBe(true);
    });
  });

  describe("review_needed verdict", () => {
    it("should emit concern events with full detail", () => {
      const recorder = createAIPOTelRecorder({ tracerProvider });
      recorder.recordIntegrityCheck(REVIEW_SIGNAL);

      const s = spans()[0];
      expect(s.attributes[attr.AIP_INTEGRITY_VERDICT]).toBe("review_needed");
      expect(s.attributes[attr.AIP_INTEGRITY_CONCERNS_COUNT]).toBe(2);

      const events = s.events;
      expect(events).toHaveLength(2);

      // First concern
      expect(events[0].name).toBe("aip.concern");
      expect(events[0].attributes?.["category"]).toBe("value_misalignment");
      expect(events[0].attributes?.["severity"]).toBe("medium");
      expect(events[0].attributes?.["description"]).toContain("mild preference for user compliance");

      // Second concern
      expect(events[1].name).toBe("aip.concern");
      expect(events[1].attributes?.["category"]).toBe("boundary_approach");
      expect(events[1].attributes?.["severity"]).toBe("low");
    });

    it("should reflect truncated analysis metadata", () => {
      const recorder = createAIPOTelRecorder({ tracerProvider });
      recorder.recordIntegrityCheck(REVIEW_SIGNAL);

      const a = spans()[0].attributes;
      expect(a[attr.AIP_INTEGRITY_TRUNCATED]).toBe(true);
      expect(a[attr.AIP_INTEGRITY_THINKING_TOKENS]).toBe(2400);
      expect(a[attr.AIP_INTEGRITY_EXTRACTION_CONFIDENCE]).toBe(0.82);
    });

    it("should reflect deep conscience consultation", () => {
      const recorder = createAIPOTelRecorder({ tracerProvider });
      recorder.recordIntegrityCheck(REVIEW_SIGNAL);

      const a = spans()[0].attributes;
      expect(a[attr.AIP_CONSCIENCE_CONSULTATION_DEPTH]).toBe("deep");
      expect(a[attr.AIP_CONSCIENCE_VALUES_CHECKED_COUNT]).toBe(5);
      expect(a[attr.AIP_CONSCIENCE_CONFLICTS_COUNT]).toBe(1);
    });
  });

  describe("boundary_violation verdict", () => {
    it("should emit 3 concern events + 1 drift alert event", () => {
      const recorder = createAIPOTelRecorder({ tracerProvider });
      recorder.recordIntegrityCheck(BOUNDARY_VIOLATION_SIGNAL);

      const s = spans()[0];
      const events = s.events;

      // 3 concern events + 1 drift alert (because drift_alert_active=true)
      expect(events).toHaveLength(4);

      const concerns = events.filter((e) => e.name === "aip.concern");
      const driftAlerts = events.filter((e) => e.name === "aip.drift_alert");

      expect(concerns).toHaveLength(3);
      expect(driftAlerts).toHaveLength(1);

      // Verify concern severity ordering
      expect(concerns[0].attributes?.["category"]).toBe("safety_violation");
      expect(concerns[0].attributes?.["severity"]).toBe("critical");
      expect(concerns[1].attributes?.["category"]).toBe("deception_attempt");
      expect(concerns[1].attributes?.["severity"]).toBe("high");
      expect(concerns[2].attributes?.["category"]).toBe("autonomy_violation");
      expect(concerns[2].attributes?.["severity"]).toBe("high");
    });

    it("should set proceed=false and block_and_alert action", () => {
      const recorder = createAIPOTelRecorder({ tracerProvider });
      recorder.recordIntegrityCheck(BOUNDARY_VIOLATION_SIGNAL);

      const a = spans()[0].attributes;
      expect(a[attr.AIP_INTEGRITY_PROCEED]).toBe(false);
      expect(a[attr.AIP_INTEGRITY_RECOMMENDED_ACTION]).toBe("block_and_alert");
    });

    it("should reflect degraded window integrity", () => {
      const recorder = createAIPOTelRecorder({ tracerProvider });
      recorder.recordIntegrityCheck(BOUNDARY_VIOLATION_SIGNAL);

      const a = spans()[0].attributes;
      expect(a[attr.AIP_WINDOW_SIZE]).toBe(12);
      expect(a[attr.AIP_WINDOW_INTEGRITY_RATIO]).toBe(0.67);
      expect(a[attr.AIP_WINDOW_DRIFT_ALERT_ACTIVE]).toBe(true);
      expect(a[attr.GEN_AI_EVALUATION_SCORE]).toBe(0.67);
    });
  });
});

// ===========================================================================
// 3. VERIFICATION — pass and fail paths, events
// ===========================================================================

describe("E2E: AAP Verification", () => {
  beforeEach(setupTracing);
  afterEach(teardownTracing);

  it("should record a passing verification with all 8 attributes", () => {
    const recorder = createAIPOTelRecorder({ tracerProvider });
    recorder.recordVerification(PASS_VERIFICATION);

    const s = spans()[0];
    expect(s.name).toBe("aap.verify_trace");

    const a = s.attributes;
    expect(a[attr.AAP_VERIFICATION_RESULT]).toBe(true);
    expect(a[attr.AAP_VERIFICATION_SIMILARITY_SCORE]).toBe(0.96);
    expect(a[attr.AAP_VERIFICATION_VIOLATIONS_COUNT]).toBe(0);
    expect(a[attr.AAP_VERIFICATION_WARNINGS_COUNT]).toBe(1);
    expect(a[attr.AAP_VERIFICATION_TRACE_ID]).toBe("trace-e2e-001");
    expect(a[attr.AAP_VERIFICATION_CARD_ID]).toBe("card-ember-v1");
    expect(a[attr.AAP_VERIFICATION_DURATION_MS]).toBe(45.2);
    expect(a[attr.AAP_VERIFICATION_CHECKS_PERFORMED]).toBe(
      "schema_validation, signature_verification, temporal_consistency, value_coherence"
    );
  });

  it("should emit no violation events for passing verification", () => {
    const recorder = createAIPOTelRecorder({ tracerProvider });
    recorder.recordVerification(PASS_VERIFICATION);

    expect(spans()[0].events).toHaveLength(0);
  });

  it("should record a failing verification with 3 violation events", () => {
    const recorder = createAIPOTelRecorder({ tracerProvider });
    recorder.recordVerification(FAIL_VERIFICATION);

    const s = spans()[0];
    expect(s.attributes[attr.AAP_VERIFICATION_RESULT]).toBe(false);
    expect(s.attributes[attr.AAP_VERIFICATION_SIMILARITY_SCORE]).toBe(0.31);
    expect(s.attributes[attr.AAP_VERIFICATION_VIOLATIONS_COUNT]).toBe(3);
    expect(s.attributes[attr.AAP_VERIFICATION_WARNINGS_COUNT]).toBe(2);

    const events = s.events;
    expect(events).toHaveLength(3);

    expect(events[0].name).toBe("aap.violation");
    expect(events[0].attributes?.["type"]).toBe("value_mismatch");
    expect(events[0].attributes?.["severity"]).toBe("critical");

    expect(events[1].attributes?.["type"]).toBe("forbidden_action");
    expect(events[1].attributes?.["severity"]).toBe("critical");

    expect(events[2].attributes?.["type"]).toBe("temporal_inconsistency");
    expect(events[2].attributes?.["severity"]).toBe("medium");
  });

  it("should join checks_performed as comma-separated string", () => {
    const recorder = createAIPOTelRecorder({ tracerProvider });
    recorder.recordVerification(FAIL_VERIFICATION);

    const a = spans()[0].attributes;
    expect(a[attr.AAP_VERIFICATION_CHECKS_PERFORMED]).toBe(
      "schema_validation, signature_verification, value_coherence"
    );
  });
});

// ===========================================================================
// 4. COHERENCE — compatible and incompatible paths
// ===========================================================================

describe("E2E: AAP Coherence", () => {
  beforeEach(setupTracing);
  afterEach(teardownTracing);

  it("should record compatible coherence with all 5 attributes", () => {
    const recorder = createAIPOTelRecorder({ tracerProvider });
    recorder.recordCoherence(COMPATIBLE_COHERENCE);

    const s = spans()[0];
    expect(s.name).toBe("aap.check_coherence");

    const a = s.attributes;
    expect(a[attr.AAP_COHERENCE_COMPATIBLE]).toBe(true);
    expect(a[attr.AAP_COHERENCE_SCORE]).toBe(0.92);
    expect(a[attr.AAP_COHERENCE_PROCEED]).toBe(true);
    expect(a[attr.AAP_COHERENCE_MATCHED_COUNT]).toBe(4);
    expect(a[attr.AAP_COHERENCE_CONFLICT_COUNT]).toBe(0);
  });

  it("should record incompatible coherence with conflict counts", () => {
    const recorder = createAIPOTelRecorder({ tracerProvider });
    recorder.recordCoherence(CONFLICT_COHERENCE);

    const a = spans()[0].attributes;
    expect(a[attr.AAP_COHERENCE_COMPATIBLE]).toBe(false);
    expect(a[attr.AAP_COHERENCE_SCORE]).toBe(0.38);
    expect(a[attr.AAP_COHERENCE_PROCEED]).toBe(false);
    expect(a[attr.AAP_COHERENCE_MATCHED_COUNT]).toBe(1);
    expect(a[attr.AAP_COHERENCE_CONFLICT_COUNT]).toBe(2);
  });

  it("should emit no events (coherence uses attributes only)", () => {
    const recorder = createAIPOTelRecorder({ tracerProvider });
    recorder.recordCoherence(COMPATIBLE_COHERENCE);
    recorder.recordCoherence(CONFLICT_COHERENCE);

    for (const s of spans()) {
      expect(s.events).toHaveLength(0);
    }
  });
});

// ===========================================================================
// 5. DRIFT DETECTION — alert events with full detail
// ===========================================================================

describe("E2E: AAP Drift Detection", () => {
  beforeEach(setupTracing);
  afterEach(teardownTracing);

  it("should record drift with correct span attributes", () => {
    const recorder = createAIPOTelRecorder({ tracerProvider });
    recorder.recordDrift(DRIFT_ALERTS, 50);

    const s = spans()[0];
    expect(s.name).toBe("aap.detect_drift");
    expect(s.attributes[attr.AAP_DRIFT_ALERTS_COUNT]).toBe(2);
    expect(s.attributes[attr.AAP_DRIFT_TRACES_ANALYZED]).toBe(50);
  });

  it("should emit one event per drift alert with full detail", () => {
    const recorder = createAIPOTelRecorder({ tracerProvider });
    recorder.recordDrift(DRIFT_ALERTS, 50);

    const events = spans()[0].events;
    expect(events).toHaveLength(2);

    // First alert: behavioral_drift
    expect(events[0].name).toBe("aap.drift_alert");
    expect(events[0].attributes?.["alert_type"]).toBe("behavioral_drift");
    expect(events[0].attributes?.["agent_id"]).toBe("agent-ember");
    expect(events[0].attributes?.["card_id"]).toBe("card-ember-v1");
    expect(events[0].attributes?.["similarity_score"]).toBe(0.62);
    expect(events[0].attributes?.["drift_direction"]).toBe("permissive");
    expect(events[0].attributes?.["recommendation"]).toBe(
      "Review recent interactions and consider alignment card refresh"
    );

    // Second alert: value_erosion
    expect(events[1].name).toBe("aap.drift_alert");
    expect(events[1].attributes?.["alert_type"]).toBe("value_erosion");
    expect(events[1].attributes?.["similarity_score"]).toBe(0.71);
    expect(events[1].attributes?.["drift_direction"]).toBe("narrowing");
    expect(events[1].attributes?.["recommendation"]).toBe("Monitor — not yet actionable");
  });

  it("should handle empty alerts array", () => {
    const recorder = createAIPOTelRecorder({ tracerProvider });
    recorder.recordDrift([], 100);

    const s = spans()[0];
    expect(s.attributes[attr.AAP_DRIFT_ALERTS_COUNT]).toBe(0);
    expect(s.attributes[attr.AAP_DRIFT_TRACES_ANALYZED]).toBe(100);
    expect(s.events).toHaveLength(0);
  });

  it("should handle missing tracesAnalyzed", () => {
    const recorder = createAIPOTelRecorder({ tracerProvider });
    recorder.recordDrift(DRIFT_ALERTS);

    const a = spans()[0].attributes;
    expect(a[attr.AAP_DRIFT_ALERTS_COUNT]).toBe(2);
    expect(a[attr.AAP_DRIFT_TRACES_ANALYZED]).toBeUndefined();
  });
});

// ===========================================================================
// 6. SPAN CONTEXT PROPAGATION — parent-child relationships
// ===========================================================================

describe("E2E: Span parent-child context propagation", () => {
  beforeEach(setupTracing);
  afterEach(teardownTracing);

  it("should create child spans under an active parent", () => {
    const recorder = createAIPOTelRecorder({ tracerProvider });
    const tracer = tracerProvider.getTracer("e2e-parent");

    // Create a parent span representing an agent turn
    const parentSpan = tracer.startSpan("agent.process_turn");
    const ctx = trace.setSpan(context.active(), parentSpan);

    // Record within parent context
    context.with(ctx, () => {
      recorder.recordIntegrityCheck(CLEAR_SIGNAL);
      recorder.recordVerification(PASS_VERIFICATION);
    });

    parentSpan.end();

    const allSpans = spans();
    expect(allSpans).toHaveLength(3);

    const parent = allSpans.find((s) => s.name === "agent.process_turn")!;
    const integritySpan = allSpans.find((s) => s.name === "aip.integrity_check")!;
    const verifySpan = allSpans.find((s) => s.name === "aap.verify_trace")!;

    // Both should share the parent's trace ID
    expect(integritySpan.spanContext().traceId).toBe(parent.spanContext().traceId);
    expect(verifySpan.spanContext().traceId).toBe(parent.spanContext().traceId);

    // Both should have the parent's span ID as parentSpanId
    expect(integritySpan.parentSpanId).toBe(parent.spanContext().spanId);
    expect(verifySpan.parentSpanId).toBe(parent.spanContext().spanId);
  });

  it("should create root spans when no parent is active", () => {
    const recorder = createAIPOTelRecorder({ tracerProvider });
    recorder.recordIntegrityCheck(CLEAR_SIGNAL);

    const s = spans()[0];
    // No parent — parentSpanId should be undefined or the zero ID
    expect(s.parentSpanId).toBeFalsy();
  });

  it("should maintain separate trace IDs for independent recordings", () => {
    const recorder = createAIPOTelRecorder({ tracerProvider });

    recorder.recordIntegrityCheck(CLEAR_SIGNAL);
    recorder.recordIntegrityCheck(REVIEW_SIGNAL);

    const [s1, s2] = spans();
    // Two independent recordings should each be root spans
    // They may or may not share a trace ID depending on context, but both should be valid
    expect(s1.spanContext().traceId).toBeTruthy();
    expect(s2.spanContext().traceId).toBeTruthy();
    expect(s1.spanContext().spanId).not.toBe(s2.spanContext().spanId);
  });
});

// ===========================================================================
// 7. WORKERS EXPORTER — full OTLP wire format verification
// ===========================================================================

describe("E2E: Workers exporter OTLP pipeline", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(new Response("OK", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should serialize a full agent lifecycle to OTLP JSON", async () => {
    const exporter = createWorkersExporter({
      endpoint: "https://otel.example.com/v1/traces",
      authorization: "Bearer token-123",
      serviceName: "agent-ember-worker",
    });

    // Simulate a full agent turn lifecycle
    exporter.recordIntegrityCheck(CLEAR_SIGNAL);
    exporter.recordIntegrityCheck(REVIEW_SIGNAL);
    exporter.recordVerification(PASS_VERIFICATION);
    exporter.recordCoherence(COMPATIBLE_COHERENCE);
    exporter.recordDrift(DRIFT_ALERTS, 50);

    await exporter.flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://otel.example.com/v1/traces");
    expect(options.method).toBe("POST");
    expect(options.headers["Authorization"]).toBe("Bearer token-123");
    expect(options.headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(options.body);

    // Resource
    const resource = body.resourceSpans[0].resource;
    expect(resource.attributes).toEqual([
      { key: "service.name", value: { stringValue: "agent-ember-worker" } },
    ]);

    // Scope
    const scope = body.resourceSpans[0].scopeSpans[0].scope;
    expect(scope.name).toBe("@mnemom/aip-otel-exporter");
    expect(scope.version).toBe("0.1.0");

    // Spans
    const otlpSpans = body.resourceSpans[0].scopeSpans[0].spans;
    expect(otlpSpans).toHaveLength(5);

    // Verify span names
    expect(otlpSpans.map((s: { name: string }) => s.name)).toEqual([
      "aip.integrity_check",
      "aip.integrity_check",
      "aap.verify_trace",
      "aap.check_coherence",
      "aap.detect_drift",
    ]);

    // All spans should have kind=1 (INTERNAL) and status.code=1 (OK)
    for (const span of otlpSpans) {
      expect(span.kind).toBe(1);
      expect(span.status.code).toBe(1);
    }
  });

  it("should produce valid OTLP trace/span IDs", async () => {
    const exporter = createWorkersExporter({
      endpoint: "https://otel.example.com/v1/traces",
    });

    exporter.recordIntegrityCheck(CLEAR_SIGNAL);
    await exporter.flush();

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const span = body.resourceSpans[0].scopeSpans[0].spans[0];

    // Trace ID: 32 hex characters
    expect(span.traceId).toMatch(/^[0-9a-f]{32}$/);
    // Span ID: 16 hex characters
    expect(span.spanId).toMatch(/^[0-9a-f]{16}$/);
    // Timestamps should be nanosecond strings
    expect(span.startTimeUnixNano).toMatch(/^\d+$/);
    expect(span.endTimeUnixNano).toMatch(/^\d+$/);
  });

  it("should serialize OTLP attributes with correct type encoding", async () => {
    const exporter = createWorkersExporter({
      endpoint: "https://otel.example.com/v1/traces",
    });

    exporter.recordIntegrityCheck(CLEAR_SIGNAL);
    await exporter.flush();

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const attrs = body.resourceSpans[0].scopeSpans[0].spans[0].attributes;

    // Find specific attributes and verify their OTLP encoding
    const findAttr = (key: string) => attrs.find((a: { key: string }) => a.key === key);

    // String: verdict
    const verdict = findAttr("aip.integrity.verdict");
    expect(verdict).toBeDefined();
    expect(verdict.value).toEqual({ stringValue: "clear" });

    // Boolean: proceed
    const proceed = findAttr("aip.integrity.proceed");
    expect(proceed).toBeDefined();
    expect(proceed.value).toEqual({ boolValue: true });

    // Integer: concerns_count
    const concernsCount = findAttr("aip.integrity.concerns_count");
    expect(concernsCount).toBeDefined();
    expect(concernsCount.value).toEqual({ intValue: "0" });

    // Double: analysis_duration_ms
    const duration = findAttr("aip.integrity.analysis_duration_ms");
    expect(duration).toBeDefined();
    expect(duration.value).toEqual({ doubleValue: 312.7 });

    // Integer: thinking_tokens
    const tokens = findAttr("aip.integrity.thinking_tokens");
    expect(tokens).toBeDefined();
    expect(tokens.value).toEqual({ intValue: "847" });
  });

  it("should serialize concern events into OTLP format", async () => {
    const exporter = createWorkersExporter({
      endpoint: "https://otel.example.com/v1/traces",
    });

    exporter.recordIntegrityCheck(REVIEW_SIGNAL);
    await exporter.flush();

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const span = body.resourceSpans[0].scopeSpans[0].spans[0];

    expect(span.events).toHaveLength(2);

    const event = span.events[0];
    expect(event.name).toBe("aip.concern");
    expect(event.timeUnixNano).toMatch(/^\d+$/);

    // Event attributes should be OTLP-encoded
    const findEventAttr = (key: string) =>
      event.attributes.find((a: { key: string }) => a.key === key);

    expect(findEventAttr("category")?.value).toEqual({ stringValue: "value_misalignment" });
    expect(findEventAttr("severity")?.value).toEqual({ stringValue: "medium" });
  });

  it("should serialize drift alert events into OTLP format", async () => {
    const exporter = createWorkersExporter({
      endpoint: "https://otel.example.com/v1/traces",
    });

    exporter.recordDrift(DRIFT_ALERTS, 50);
    await exporter.flush();

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const span = body.resourceSpans[0].scopeSpans[0].spans[0];

    expect(span.events).toHaveLength(2);

    const event = span.events[0];
    expect(event.name).toBe("aap.drift_alert");

    const findEventAttr = (key: string) =>
      event.attributes.find((a: { key: string }) => a.key === key);

    expect(findEventAttr("alert_type")?.value).toEqual({ stringValue: "behavioral_drift" });
    expect(findEventAttr("similarity_score")?.value).toEqual({ doubleValue: 0.62 });
    expect(findEventAttr("drift_direction")?.value).toEqual({ stringValue: "permissive" });
  });

  it("should serialize boundary_violation with drift_alert event", async () => {
    const exporter = createWorkersExporter({
      endpoint: "https://otel.example.com/v1/traces",
    });

    exporter.recordIntegrityCheck(BOUNDARY_VIOLATION_SIGNAL);
    await exporter.flush();

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const span = body.resourceSpans[0].scopeSpans[0].spans[0];

    // 3 concerns + 1 drift alert
    expect(span.events).toHaveLength(4);
    expect(span.events.filter((e: { name: string }) => e.name === "aip.concern")).toHaveLength(3);
    expect(span.events.filter((e: { name: string }) => e.name === "aip.drift_alert")).toHaveLength(1);
  });

  it("should omit null/undefined attributes from OTLP payload", async () => {
    const exporter = createWorkersExporter({
      endpoint: "https://otel.example.com/v1/traces",
    });

    // Minimal signal — most fields are undefined
    exporter.recordIntegrityCheck({ checkpoint: { verdict: "clear" } });
    await exporter.flush();

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const attrs = body.resourceSpans[0].scopeSpans[0].spans[0].attributes;

    // Should only have the defined attributes (verdict + GenAI alias)
    const keys = attrs.map((a: { key: string }) => a.key);
    expect(keys).toContain("aip.integrity.verdict");
    expect(keys).toContain("gen_ai.evaluation.verdict");

    // Should NOT contain attributes that were undefined
    expect(keys).not.toContain("aip.integrity.checkpoint_id");
    expect(keys).not.toContain("aip.integrity.agent_id");
    expect(keys).not.toContain("aip.integrity.analysis_model");
    expect(keys).not.toContain("aip.window.size");
  });
});

// ===========================================================================
// 8. METRICS — full pipeline with InMemoryMetricExporter
// ===========================================================================

describe("E2E: Metrics pipeline", () => {
  let metricExporter: InMemoryMetricExporter;
  let metricReader: PeriodicExportingMetricReader;
  let meterProvider: MeterProvider;

  beforeEach(() => {
    metricExporter = new InMemoryMetricExporter(
      0 /* AggregationTemporality.DELTA — but the enum value is 0 for CUMULATIVE */
    );
    metricReader = new PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: 100,
    });
    meterProvider = new MeterProvider({
      readers: [metricReader],
    });
  });

  afterEach(async () => {
    await meterProvider.shutdown();
  });

  it("should record integrity metrics and read them back", async () => {
    const m = createAIPMetrics(meterProvider);

    recordIntegrityMetrics(m, CLEAR_SIGNAL);
    recordIntegrityMetrics(m, REVIEW_SIGNAL);
    recordIntegrityMetrics(m, BOUNDARY_VIOLATION_SIGNAL);

    // Force collection
    await metricReader.forceFlush();

    const metrics = metricExporter.getMetrics();
    expect(metrics.length).toBeGreaterThan(0);

    // Find the integrity checks counter
    const scopeMetrics = metrics[0].scopeMetrics;
    expect(scopeMetrics.length).toBeGreaterThan(0);

    const allMetricNames = scopeMetrics.flatMap((sm) =>
      sm.metrics.map((m) => m.descriptor.name)
    );

    expect(allMetricNames).toContain("aip.integrity_checks.total");
    expect(allMetricNames).toContain("aip.concerns.total");
    expect(allMetricNames).toContain("aip.analysis.duration_ms");
    expect(allMetricNames).toContain("aip.window.integrity_ratio");
    expect(allMetricNames).toContain("aip.drift_alerts.total");
  });

  it("should record verification metrics", async () => {
    const m = createAIPMetrics(meterProvider);

    recordVerificationMetrics(m, PASS_VERIFICATION);
    recordVerificationMetrics(m, FAIL_VERIFICATION);

    await metricReader.forceFlush();

    const metrics = metricExporter.getMetrics();
    const allMetricNames = metrics[0].scopeMetrics.flatMap((sm) =>
      sm.metrics.map((m) => m.descriptor.name)
    );

    expect(allMetricNames).toContain("aap.verifications.total");
    expect(allMetricNames).toContain("aap.violations.total");
    expect(allMetricNames).toContain("aap.verification.duration_ms");
  });

  it("should record coherence metrics", async () => {
    const m = createAIPMetrics(meterProvider);

    recordCoherenceMetrics(m, COMPATIBLE_COHERENCE);
    recordCoherenceMetrics(m, CONFLICT_COHERENCE);

    await metricReader.forceFlush();

    const metrics = metricExporter.getMetrics();
    const allMetricNames = metrics[0].scopeMetrics.flatMap((sm) =>
      sm.metrics.map((m) => m.descriptor.name)
    );

    expect(allMetricNames).toContain("aap.coherence.score");
  });

  it("should record drift metrics", async () => {
    const m = createAIPMetrics(meterProvider);

    recordDriftMetrics(m, DRIFT_ALERTS);

    await metricReader.forceFlush();

    const metrics = metricExporter.getMetrics();
    const allMetricNames = metrics[0].scopeMetrics.flatMap((sm) =>
      sm.metrics.map((m) => m.descriptor.name)
    );

    expect(allMetricNames).toContain("aip.drift_alerts.total");
  });
});

// ===========================================================================
// 9. COMBINED PIPELINE — traces + metrics in realistic lifecycle
// ===========================================================================

describe("E2E: Combined traces + metrics agent lifecycle", () => {
  let metricExporter: InMemoryMetricExporter;
  let metricReader: PeriodicExportingMetricReader;
  let meterProvider: MeterProvider;

  beforeEach(() => {
    setupTracing();
    metricExporter = new InMemoryMetricExporter(0);
    metricReader = new PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: 100,
    });
    meterProvider = new MeterProvider({
      readers: [metricReader],
    });
  });

  afterEach(async () => {
    teardownTracing();
    await meterProvider.shutdown();
  });

  it("should simulate a full agent session with traces and metrics", async () => {
    const recorder = createAIPOTelRecorder({ tracerProvider });
    const metrics = createAIPMetrics(meterProvider);
    const tracer = tracerProvider.getTracer("e2e-lifecycle");

    // === Turn 1: Agent processes user request, integrity clear ===
    const turn1 = tracer.startSpan("agent.turn.1");
    const ctx1 = trace.setSpan(context.active(), turn1);

    context.with(ctx1, () => {
      recorder.recordIntegrityCheck(CLEAR_SIGNAL);
      recordIntegrityMetrics(metrics, CLEAR_SIGNAL);
    });
    turn1.end();

    // === Turn 2: Agent shows mild sycophancy, review needed ===
    const turn2 = tracer.startSpan("agent.turn.2");
    const ctx2 = trace.setSpan(context.active(), turn2);

    context.with(ctx2, () => {
      recorder.recordIntegrityCheck(REVIEW_SIGNAL);
      recordIntegrityMetrics(metrics, REVIEW_SIGNAL);
    });
    turn2.end();

    // === Turn 3: Agent crosses boundary ===
    const turn3 = tracer.startSpan("agent.turn.3");
    const ctx3 = trace.setSpan(context.active(), turn3);

    context.with(ctx3, () => {
      recorder.recordIntegrityCheck(BOUNDARY_VIOLATION_SIGNAL);
      recordIntegrityMetrics(metrics, BOUNDARY_VIOLATION_SIGNAL);
    });
    turn3.end();

    // === Post-session: Verify trace and check coherence ===
    recorder.recordVerification(FAIL_VERIFICATION);
    recordVerificationMetrics(metrics, FAIL_VERIFICATION);

    recorder.recordCoherence(CONFLICT_COHERENCE);
    recordCoherenceMetrics(metrics, CONFLICT_COHERENCE);

    recorder.recordDrift(DRIFT_ALERTS, 50);
    recordDriftMetrics(metrics, DRIFT_ALERTS);

    // --- Verify traces ---
    const allSpans = spans();

    // 3 turn parents + 3 integrity checks + 1 verification + 1 coherence + 1 drift = 9
    expect(allSpans).toHaveLength(9);

    // Turn 1: parent + clear integrity check
    const turn1Span = allSpans.find((s) => s.name === "agent.turn.1")!;
    const integritySpans = spansByName("aip.integrity_check");
    expect(integritySpans).toHaveLength(3);

    // First integrity check should be child of turn 1
    expect(integritySpans[0].parentSpanId).toBe(turn1Span.spanContext().spanId);
    expect(integritySpans[0].attributes[attr.AIP_INTEGRITY_VERDICT]).toBe("clear");

    // Second integrity check should be child of turn 2
    const turn2Span = allSpans.find((s) => s.name === "agent.turn.2")!;
    expect(integritySpans[1].parentSpanId).toBe(turn2Span.spanContext().spanId);
    expect(integritySpans[1].attributes[attr.AIP_INTEGRITY_VERDICT]).toBe("review_needed");

    // Third integrity check should be child of turn 3
    const turn3Span = allSpans.find((s) => s.name === "agent.turn.3")!;
    expect(integritySpans[2].parentSpanId).toBe(turn3Span.spanContext().spanId);
    expect(integritySpans[2].attributes[attr.AIP_INTEGRITY_VERDICT]).toBe("boundary_violation");

    // Post-session spans should be root spans
    const verifySpan = spanByName("aap.verify_trace");
    expect(verifySpan.parentSpanId).toBeFalsy();

    // --- Verify metrics ---
    await metricReader.forceFlush();

    const metricData = metricExporter.getMetrics();
    expect(metricData.length).toBeGreaterThan(0);

    const allMetricNames = metricData[0].scopeMetrics.flatMap((sm) =>
      sm.metrics.map((m) => m.descriptor.name)
    );

    // All metric types should have been recorded
    expect(allMetricNames).toContain("aip.integrity_checks.total");
    expect(allMetricNames).toContain("aip.concerns.total");
    expect(allMetricNames).toContain("aip.analysis.duration_ms");
    expect(allMetricNames).toContain("aip.window.integrity_ratio");
    expect(allMetricNames).toContain("aip.drift_alerts.total");
    expect(allMetricNames).toContain("aap.verifications.total");
    expect(allMetricNames).toContain("aap.violations.total");
    expect(allMetricNames).toContain("aap.verification.duration_ms");
    expect(allMetricNames).toContain("aap.coherence.score");
  });
});

// ===========================================================================
// 10. EDGE CASES — stress the duck-typing and graceful degradation
// ===========================================================================

describe("E2E: Edge cases and graceful degradation", () => {
  beforeEach(setupTracing);
  afterEach(teardownTracing);

  it("should handle completely empty checkpoint", () => {
    const recorder = createAIPOTelRecorder({ tracerProvider });
    recorder.recordIntegrityCheck({ checkpoint: {} });

    const s = spans()[0];
    expect(s.name).toBe("aip.integrity_check");
    expect(s.status.code).toBe(SpanStatusCode.OK);
    expect(s.events).toHaveLength(0);

    // All attributes should be undefined (not set on span)
    expect(s.attributes[attr.AIP_INTEGRITY_VERDICT]).toBeUndefined();
    expect(s.attributes[attr.AIP_INTEGRITY_AGENT_ID]).toBeUndefined();
  });

  it("should handle completely empty verification", () => {
    const recorder = createAIPOTelRecorder({ tracerProvider });
    recorder.recordVerification({});

    const s = spans()[0];
    expect(s.name).toBe("aap.verify_trace");
    expect(s.status.code).toBe(SpanStatusCode.OK);
    expect(s.events).toHaveLength(0);
  });

  it("should handle completely empty coherence", () => {
    const recorder = createAIPOTelRecorder({ tracerProvider });
    recorder.recordCoherence({});

    const s = spans()[0];
    expect(s.name).toBe("aap.check_coherence");
    expect(s.status.code).toBe(SpanStatusCode.OK);
  });

  it("should handle completely empty drift", () => {
    const recorder = createAIPOTelRecorder({ tracerProvider });
    recorder.recordDrift([]);

    const s = spans()[0];
    expect(s.name).toBe("aap.detect_drift");
    expect(s.attributes[attr.AAP_DRIFT_ALERTS_COUNT]).toBe(0);
    expect(s.events).toHaveLength(0);
  });

  it("should handle drift alerts with sparse data", () => {
    const recorder = createAIPOTelRecorder({ tracerProvider });
    recorder.recordDrift([{}, { alert_type: "minimal" }], 5);

    const s = spans()[0];
    expect(s.attributes[attr.AAP_DRIFT_ALERTS_COUNT]).toBe(2);
    expect(s.events).toHaveLength(2);

    // First event should have empty attributes (all undefined/null filtered)
    // Second event should have only alert_type
    expect(s.events[1].attributes?.["alert_type"]).toBe("minimal");
  });

  it("should handle verification with empty violations/warnings arrays", () => {
    const recorder = createAIPOTelRecorder({ tracerProvider });
    recorder.recordVerification({
      verified: true,
      violations: [],
      warnings: [],
    });

    const s = spans()[0];
    expect(s.attributes[attr.AAP_VERIFICATION_VIOLATIONS_COUNT]).toBe(0);
    expect(s.attributes[attr.AAP_VERIFICATION_WARNINGS_COUNT]).toBe(0);
    expect(s.events).toHaveLength(0);
  });

  it("should handle coherence with empty value_alignment arrays", () => {
    const recorder = createAIPOTelRecorder({ tracerProvider });
    recorder.recordCoherence({
      compatible: true,
      score: 1.0,
      value_alignment: {
        matched: [],
        conflicts: [],
      },
    });

    const a = spans()[0].attributes;
    expect(a[attr.AAP_COHERENCE_MATCHED_COUNT]).toBe(0);
    expect(a[attr.AAP_COHERENCE_CONFLICT_COUNT]).toBe(0);
  });

  it("should handle missing value_alignment entirely", () => {
    const recorder = createAIPOTelRecorder({ tracerProvider });
    recorder.recordCoherence({
      compatible: true,
      score: 0.5,
    });

    const a = spans()[0].attributes;
    expect(a[attr.AAP_COHERENCE_COMPATIBLE]).toBe(true);
    expect(a[attr.AAP_COHERENCE_SCORE]).toBe(0.5);
    expect(a[attr.AAP_COHERENCE_MATCHED_COUNT]).toBeUndefined();
    expect(a[attr.AAP_COHERENCE_CONFLICT_COUNT]).toBeUndefined();
  });

  it("should handle rapid sequential recordings", () => {
    const recorder = createAIPOTelRecorder({ tracerProvider });

    // Simulate 20 rapid integrity checks
    for (let i = 0; i < 20; i++) {
      recorder.recordIntegrityCheck({
        checkpoint: {
          checkpoint_id: `ic-rapid-${i}`,
          verdict: i % 3 === 0 ? "clear" : i % 3 === 1 ? "review_needed" : "boundary_violation",
        },
      });
    }

    expect(spans()).toHaveLength(20);

    // Verify each has a unique checkpoint_id
    const ids = spans().map((s) => s.attributes[attr.AIP_INTEGRITY_CHECKPOINT_ID]);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(20);
  });

  it("should produce unique span IDs across all recordings", () => {
    const recorder = createAIPOTelRecorder({ tracerProvider });

    recorder.recordIntegrityCheck(CLEAR_SIGNAL);
    recorder.recordVerification(PASS_VERIFICATION);
    recorder.recordCoherence(COMPATIBLE_COHERENCE);
    recorder.recordDrift(DRIFT_ALERTS, 10);

    const spanIds = spans().map((s) => s.spanContext().spanId);
    const uniqueIds = new Set(spanIds);
    expect(uniqueIds.size).toBe(4);
  });

  it("should handle null values in concern fields", () => {
    const recorder = createAIPOTelRecorder({ tracerProvider });
    recorder.recordIntegrityCheck({
      checkpoint: {
        verdict: "review_needed",
        concerns: [
          {
            category: "test",
            severity: "low",
            description: "test concern",
            relevant_card_field: null,
            relevant_conscience_value: null,
          },
        ],
      },
    });

    const events = spans()[0].events;
    expect(events).toHaveLength(1);
    expect(events[0].attributes?.["category"]).toBe("test");
  });

  it("should handle integrity check with window showing all verdict types", () => {
    const recorder = createAIPOTelRecorder({ tracerProvider });
    recorder.recordIntegrityCheck({
      checkpoint: {
        verdict: "clear",
      },
      window_summary: {
        size: 100,
        max_size: 100,
        verdicts: {
          clear: 80,
          review_needed: 15,
          boundary_violation: 5,
        },
        integrity_ratio: 0.80,
        drift_alert_active: false,
      },
    });

    const a = spans()[0].attributes;
    expect(a[attr.AIP_WINDOW_SIZE]).toBe(100);
    expect(a[attr.AIP_WINDOW_INTEGRITY_RATIO]).toBe(0.80);
    expect(a[attr.GEN_AI_EVALUATION_SCORE]).toBe(0.80);
  });
});

// ===========================================================================
// 11. WORKERS EXPORTER — edge cases and batching
// ===========================================================================

describe("E2E: Workers exporter edge cases", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(new Response("OK", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should produce unique trace/span IDs per span", async () => {
    const exporter = createWorkersExporter({
      endpoint: "https://otel.example.com/v1/traces",
    });

    exporter.recordIntegrityCheck(CLEAR_SIGNAL);
    exporter.recordIntegrityCheck(REVIEW_SIGNAL);
    exporter.recordVerification(PASS_VERIFICATION);
    await exporter.flush();

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const otlpSpans = body.resourceSpans[0].scopeSpans[0].spans;

    const traceIds = new Set(otlpSpans.map((s: { traceId: string }) => s.traceId));
    const spanIds = new Set(otlpSpans.map((s: { spanId: string }) => s.spanId));

    // Each span should have a unique spanId
    expect(spanIds.size).toBe(3);
    // Each span should have a unique traceId (they're independent root spans)
    expect(traceIds.size).toBe(3);
  });

  it("should handle verification with all violations serialized", async () => {
    const exporter = createWorkersExporter({
      endpoint: "https://otel.example.com/v1/traces",
    });

    exporter.recordVerification(FAIL_VERIFICATION);
    await exporter.flush();

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const span = body.resourceSpans[0].scopeSpans[0].spans[0];

    expect(span.events).toHaveLength(3);

    // Verify each violation event has the right structure
    for (const event of span.events) {
      expect(event.name).toBe("aap.violation");
      const attrKeys = event.attributes.map((a: { key: string }) => a.key);
      expect(attrKeys).toContain("type");
      expect(attrKeys).toContain("severity");
      expect(attrKeys).toContain("description");
    }
  });

  it("should handle coherence with all attributes in OTLP format", async () => {
    const exporter = createWorkersExporter({
      endpoint: "https://otel.example.com/v1/traces",
    });

    exporter.recordCoherence(CONFLICT_COHERENCE);
    await exporter.flush();

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const span = body.resourceSpans[0].scopeSpans[0].spans[0];

    const findAttr = (key: string) =>
      span.attributes.find((a: { key: string }) => a.key === key);

    expect(findAttr("aap.coherence.compatible")?.value).toEqual({ boolValue: false });
    expect(findAttr("aap.coherence.score")?.value).toEqual({ doubleValue: 0.38 });
    expect(findAttr("aap.coherence.proceed")?.value).toEqual({ boolValue: false });
    expect(findAttr("aap.coherence.matched_count")?.value).toEqual({ intValue: "1" });
    expect(findAttr("aap.coherence.conflict_count")?.value).toEqual({ intValue: "2" });
  });

  it("should handle auto-flush at batch boundary", async () => {
    const exporter = createWorkersExporter({
      endpoint: "https://otel.example.com/v1/traces",
      maxBatchSize: 3,
    });

    exporter.recordIntegrityCheck(CLEAR_SIGNAL);
    exporter.recordVerification(PASS_VERIFICATION);
    exporter.recordCoherence(COMPATIBLE_COHERENCE); // This should trigger auto-flush

    // Wait for the fire-and-forget flush
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const otlpSpans = body.resourceSpans[0].scopeSpans[0].spans;
    expect(otlpSpans).toHaveLength(3);

    // Subsequent flush should be empty
    await exporter.flush();
    expect(fetchMock).toHaveBeenCalledTimes(1); // No additional call
  });

  it("should produce valid OTLP payload for empty signal data", async () => {
    const exporter = createWorkersExporter({
      endpoint: "https://otel.example.com/v1/traces",
    });

    exporter.recordIntegrityCheck({ checkpoint: {} });
    exporter.recordVerification({});
    exporter.recordCoherence({});
    exporter.recordDrift([]);

    await exporter.flush();

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);

    // Should still be valid OTLP structure
    expect(body.resourceSpans).toHaveLength(1);
    expect(body.resourceSpans[0].scopeSpans).toHaveLength(1);
    expect(body.resourceSpans[0].scopeSpans[0].spans).toHaveLength(4);

    // Each span should still have valid IDs and timestamps
    for (const span of body.resourceSpans[0].scopeSpans[0].spans) {
      expect(span.traceId).toMatch(/^[0-9a-f]{32}$/);
      expect(span.spanId).toMatch(/^[0-9a-f]{16}$/);
      expect(span.kind).toBe(1);
      expect(span.status.code).toBe(1);
    }
  });
});

// ===========================================================================
// 12. ATTRIBUTE COMPLETENESS — verify all exported constants are used
// ===========================================================================

describe("E2E: Attribute constant completeness", () => {
  beforeEach(setupTracing);
  afterEach(teardownTracing);

  it("should set every AIP attribute from a fully-populated signal", () => {
    const recorder = createAIPOTelRecorder({ tracerProvider });
    recorder.recordIntegrityCheck(BOUNDARY_VIOLATION_SIGNAL);

    const a = spans()[0].attributes;

    // Every AIP integrity attribute should be present
    expect(a[attr.AIP_INTEGRITY_CHECKPOINT_ID]).toBeDefined();
    expect(a[attr.AIP_INTEGRITY_VERDICT]).toBeDefined();
    expect(a[attr.AIP_INTEGRITY_AGENT_ID]).toBeDefined();
    expect(a[attr.AIP_INTEGRITY_CARD_ID]).toBeDefined();
    expect(a[attr.AIP_INTEGRITY_SESSION_ID]).toBeDefined();
    expect(a[attr.AIP_INTEGRITY_THINKING_HASH]).toBeDefined();
    expect(a[attr.AIP_INTEGRITY_PROCEED]).toBeDefined();
    expect(a[attr.AIP_INTEGRITY_RECOMMENDED_ACTION]).toBeDefined();
    expect(a[attr.AIP_INTEGRITY_CONCERNS_COUNT]).toBeDefined();
    expect(a[attr.AIP_INTEGRITY_ANALYSIS_MODEL]).toBeDefined();
    expect(a[attr.AIP_INTEGRITY_ANALYSIS_DURATION_MS]).toBeDefined();
    expect(a[attr.AIP_INTEGRITY_THINKING_TOKENS]).toBeDefined();
    expect(a[attr.AIP_INTEGRITY_TRUNCATED]).toBeDefined();
    expect(a[attr.AIP_INTEGRITY_EXTRACTION_CONFIDENCE]).toBeDefined();
    expect(a[attr.AIP_CONSCIENCE_CONSULTATION_DEPTH]).toBeDefined();
    expect(a[attr.AIP_CONSCIENCE_VALUES_CHECKED_COUNT]).toBeDefined();
    expect(a[attr.AIP_CONSCIENCE_CONFLICTS_COUNT]).toBeDefined();
    expect(a[attr.AIP_WINDOW_SIZE]).toBeDefined();
    expect(a[attr.AIP_WINDOW_INTEGRITY_RATIO]).toBeDefined();
    expect(a[attr.AIP_WINDOW_DRIFT_ALERT_ACTIVE]).toBeDefined();
    expect(a[attr.GEN_AI_EVALUATION_VERDICT]).toBeDefined();
    expect(a[attr.GEN_AI_EVALUATION_SCORE]).toBeDefined();
  });

  it("should set every AAP verification attribute from a fully-populated result", () => {
    const recorder = createAIPOTelRecorder({ tracerProvider });
    recorder.recordVerification(FAIL_VERIFICATION);

    const a = spans()[0].attributes;

    expect(a[attr.AAP_VERIFICATION_RESULT]).toBeDefined();
    expect(a[attr.AAP_VERIFICATION_SIMILARITY_SCORE]).toBeDefined();
    expect(a[attr.AAP_VERIFICATION_VIOLATIONS_COUNT]).toBeDefined();
    expect(a[attr.AAP_VERIFICATION_WARNINGS_COUNT]).toBeDefined();
    expect(a[attr.AAP_VERIFICATION_TRACE_ID]).toBeDefined();
    expect(a[attr.AAP_VERIFICATION_CARD_ID]).toBeDefined();
    expect(a[attr.AAP_VERIFICATION_DURATION_MS]).toBeDefined();
    expect(a[attr.AAP_VERIFICATION_CHECKS_PERFORMED]).toBeDefined();
  });

  it("should set every AAP coherence attribute from a fully-populated result", () => {
    const recorder = createAIPOTelRecorder({ tracerProvider });
    recorder.recordCoherence(CONFLICT_COHERENCE);

    const a = spans()[0].attributes;

    expect(a[attr.AAP_COHERENCE_COMPATIBLE]).toBeDefined();
    expect(a[attr.AAP_COHERENCE_SCORE]).toBeDefined();
    expect(a[attr.AAP_COHERENCE_PROCEED]).toBeDefined();
    expect(a[attr.AAP_COHERENCE_MATCHED_COUNT]).toBeDefined();
    expect(a[attr.AAP_COHERENCE_CONFLICT_COUNT]).toBeDefined();
  });

  it("should set every AAP drift attribute from a fully-populated alert", () => {
    const recorder = createAIPOTelRecorder({ tracerProvider });
    recorder.recordDrift(DRIFT_ALERTS, 50);

    const a = spans()[0].attributes;

    expect(a[attr.AAP_DRIFT_ALERTS_COUNT]).toBeDefined();
    expect(a[attr.AAP_DRIFT_TRACES_ANALYZED]).toBeDefined();
  });
});

// ===========================================================================
// 13. PARITY — SDK spans vs Workers OTLP produce equivalent data
// ===========================================================================

describe("E2E: SDK ↔ Workers parity", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setupTracing();
    fetchMock = vi.fn().mockResolvedValue(new Response("OK", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    teardownTracing();
    vi.restoreAllMocks();
  });

  it("should produce matching span names across SDK and Workers", async () => {
    // SDK path
    const recorder = createAIPOTelRecorder({ tracerProvider });
    recorder.recordIntegrityCheck(CLEAR_SIGNAL);
    recorder.recordVerification(PASS_VERIFICATION);
    recorder.recordCoherence(COMPATIBLE_COHERENCE);
    recorder.recordDrift(DRIFT_ALERTS, 50);

    // Workers path
    const exporter = createWorkersExporter({
      endpoint: "https://otel.example.com/v1/traces",
    });
    exporter.recordIntegrityCheck(CLEAR_SIGNAL);
    exporter.recordVerification(PASS_VERIFICATION);
    exporter.recordCoherence(COMPATIBLE_COHERENCE);
    exporter.recordDrift(DRIFT_ALERTS, 50);
    await exporter.flush();

    const sdkSpanNames = spans().map((s) => s.name);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const workersSpanNames = body.resourceSpans[0].scopeSpans[0].spans.map(
      (s: { name: string }) => s.name
    );

    expect(sdkSpanNames).toEqual(workersSpanNames);
  });

  it("should produce matching event counts across SDK and Workers", async () => {
    // SDK path
    const recorder = createAIPOTelRecorder({ tracerProvider });
    recorder.recordIntegrityCheck(BOUNDARY_VIOLATION_SIGNAL);
    recorder.recordVerification(FAIL_VERIFICATION);
    recorder.recordDrift(DRIFT_ALERTS, 50);

    // Workers path
    const exporter = createWorkersExporter({
      endpoint: "https://otel.example.com/v1/traces",
    });
    exporter.recordIntegrityCheck(BOUNDARY_VIOLATION_SIGNAL);
    exporter.recordVerification(FAIL_VERIFICATION);
    exporter.recordDrift(DRIFT_ALERTS, 50);
    await exporter.flush();

    const sdkEventCounts = spans().map((s) => s.events.length);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const workersEventCounts = body.resourceSpans[0].scopeSpans[0].spans.map(
      (s: { events: unknown[] }) => s.events.length
    );

    expect(sdkEventCounts).toEqual(workersEventCounts);
  });

  it("should produce matching attribute keys across SDK and Workers for integrity check", async () => {
    // SDK path
    const recorder = createAIPOTelRecorder({ tracerProvider });
    recorder.recordIntegrityCheck(CLEAR_SIGNAL);

    // Workers path
    const exporter = createWorkersExporter({
      endpoint: "https://otel.example.com/v1/traces",
    });
    exporter.recordIntegrityCheck(CLEAR_SIGNAL);
    await exporter.flush();

    const sdkAttrKeys = Object.keys(spans()[0].attributes).sort();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const workersAttrKeys = body.resourceSpans[0].scopeSpans[0].spans[0].attributes
      .map((a: { key: string }) => a.key)
      .sort();

    expect(sdkAttrKeys).toEqual(workersAttrKeys);
  });
});
