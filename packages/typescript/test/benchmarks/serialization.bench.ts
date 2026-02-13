import { bench, describe } from "vitest";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { recordIntegrityCheck } from "../../src/manual/record-integrity-check.js";
import { recordVerification } from "../../src/manual/record-verification.js";
import { recordCoherence } from "../../src/manual/record-coherence.js";
import { recordDrift } from "../../src/manual/record-drift.js";
import {
  createOTLPSpan,
  serializeExportPayload,
} from "../../src/workers/otlp-serializer.js";
import type { IntegritySignalInput, VerificationResultInput } from "../../src/types.js";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const exporter = new InMemorySpanExporter();
const provider = new BasicTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(exporter)],
});
const tracer = provider.getTracer("bench");

const FIXTURE_SIGNAL: IntegritySignalInput = {
  checkpoint: {
    checkpoint_id: "ic-bench-1",
    agent_id: "agent-1",
    card_id: "card-1",
    session_id: "session-1",
    verdict: "clear",
    concerns: [
      { category: "value_misalignment", severity: "medium", description: "test" },
    ],
    conscience_context: {
      consultation_depth: "standard",
      values_checked: ["v1", "v2"],
      conflicts: [],
    },
    analysis_metadata: {
      analysis_model: "claude-3-haiku",
      analysis_duration_ms: 100,
      thinking_tokens_original: 500,
      truncated: false,
      extraction_confidence: 0.9,
    },
  },
  proceed: true,
  recommended_action: "continue",
  window_summary: {
    size: 5,
    integrity_ratio: 1.0,
    drift_alert_active: false,
  },
};

const FIXTURE_RESULT: VerificationResultInput = {
  verified: true,
  trace_id: "trace-1",
  card_id: "card-1",
  violations: [],
  warnings: [],
  verification_metadata: {
    duration_ms: 50,
    checks_performed: ["action_bounds"],
  },
  similarity_score: 0.95,
};

// ---------------------------------------------------------------------------
// Benchmarks
// ---------------------------------------------------------------------------

describe("serialization benchmarks", () => {
  bench("recordIntegrityCheck", () => {
    recordIntegrityCheck(tracer, FIXTURE_SIGNAL);
  });

  bench("recordVerification", () => {
    recordVerification(tracer, FIXTURE_RESULT);
  });

  bench("recordCoherence", () => {
    recordCoherence(tracer, {
      compatible: true,
      score: 0.9,
      proceed: true,
      value_alignment: { matched: ["v1"], conflicts: [] },
    });
  });

  bench("recordDrift", () => {
    recordDrift(
      tracer,
      [
        {
          alert_type: "drift",
          agent_id: "agent-1",
          analysis: { similarity_score: 0.5, drift_direction: "permissive" },
        },
      ],
      10
    );
  });

  bench("Workers OTLP serialize (createOTLPSpan)", () => {
    createOTLPSpan("test", { key: "value", count: 42 });
  });

  bench("Workers OTLP serializeExportPayload", () => {
    const span = createOTLPSpan("test", { key: "value" });
    serializeExportPayload([span], "bench-service");
  });
});
