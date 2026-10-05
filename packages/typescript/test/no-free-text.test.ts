/**
 * No free text in exported telemetry.
 *
 * The typed recorders export identifiers and operational data only (ids,
 * verdicts, enums, severities, categories, counts, durations, tool and model
 * names). Free text that can quote or paraphrase customer content must never
 * reach the trace backend. Every free-text field the input shapes allow
 * carries a sentinel here, and each test checks the exported payload for it,
 * for both the Workers (OTLP JSON over fetch) and the Node SDK recorders.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import type { Tracer } from "@opentelemetry/api";

import { createWorkersExporter } from "../src/workers/workers-exporter.js";
import { recordIntegrityCheck } from "../src/manual/record-integrity-check.js";
import { recordVerification } from "../src/manual/record-verification.js";
import { recordCoherence } from "../src/manual/record-coherence.js";
import { recordDrift } from "../src/manual/record-drift.js";
import { recordReclassification } from "../src/manual/record-reclassification.js";
import { recordPolicyEvaluation } from "../src/manual/record-policy-evaluation.js";
import { scalarAttributes } from "../src/scalar-attributes.js";
import type {
  IntegritySignalInput,
  VerificationResultInput,
  CoherenceResultInput,
  DriftAlertInput,
  ReclassificationInput,
  PolicyEvaluationInput,
} from "../src/types.js";

const FREE = "FREE-TEXT-SENTINEL";
const free = (field: string) => `${FREE} ${field}: the agent said the customer's card number is 4111`;

// ---------------------------------------------------------------------------
// Inputs: every free-text field the input shapes allow carries the sentinel,
// plus an unknown field to show nothing is copied wholesale.
// ---------------------------------------------------------------------------

const SIGNAL = {
  checkpoint: {
    checkpoint_id: "ic-1",
    agent_id: "agent-1",
    card_id: "card-1",
    session_id: "sess-1",
    thinking_block_hash: "sha256-abc",
    provider: "anthropic",
    model: "claude-opus-5-5",
    verdict: "review_needed",
    reasoning_summary: free("reasoning_summary"),
    concerns: [
      {
        category: "value_misalignment",
        severity: "medium",
        description: free("concern.description"),
        evidence: free("concern.evidence"),
        relevant_card_field: free("concern.relevant_card_field"),
        relevant_conscience_value: free("concern.relevant_conscience_value"),
        future_field: free("concern.future_field"),
      },
    ],
    conscience_context: {
      consultation_depth: "standard",
      values_checked: [free("values_checked")],
      conflicts: [free("conflicts")],
      supports: [free("supports")],
      considerations: [free("considerations")],
    },
    analysis_metadata: { analysis_model: "judge-1", analysis_duration_ms: 12 },
  },
  proceed: false,
  recommended_action: "pause_for_review",
  window_summary: { size: 3, integrity_ratio: 0.5, drift_alert_active: true },
  role: "customer",
} as IntegritySignalInput;

const VERIFICATION: VerificationResultInput = {
  verified: false,
  trace_id: "tr-1",
  card_id: "card-1",
  violations: [
    {
      type: "forbidden_action",
      severity: "critical",
      description: free("violation.description"),
      trace_field: free("violation.trace_field"),
    },
  ],
  warnings: [{ type: "style", description: free("warning.description") }],
  verification_metadata: { duration_ms: 7, checks_performed: ["autonomy", "values"] },
};

const COHERENCE: CoherenceResultInput = {
  compatible: false,
  score: 0.4,
  proceed: false,
  conditions: [free("conditions")],
  value_alignment: {
    matched: ["honesty"],
    unmatched: [free("unmatched")],
    conflicts: [{ conflict_type: "priority", description: free("coherence.conflict.description") }],
  },
};

const DRIFT: DriftAlertInput[] = [
  {
    alert_type: "behavioral_drift",
    agent_id: "agent-1",
    card_id: "card-1",
    analysis: {
      similarity_score: 0.6,
      drift_direction: "permissive",
      specific_indicators: [
        { indicator: "refusal_rate", baseline: 0.2, current: 0.05, description: free("indicator.description") },
      ],
    },
    recommendation: free("drift.recommendation"),
  },
];

const RECLASSIFICATION: ReclassificationInput = {
  agent_id: "agent-1",
  checkpoint_id: "ic-1",
  trace_id: "tr-1",
  before_verdict: "boundary_violation",
  after_classification: "card_gap",
  reason: free("reclassification.reason"),
  score_before: 0.2,
  score_after: 0.9,
};

const POLICY: PolicyEvaluationInput = {
  agent_id: "agent-1",
  policy_id: "pol-1",
  policy_version: "3",
  verdict: "fail",
  violations_count: 1,
  warnings_count: 0,
  duration_ms: 4,
  enforcement_mode: "enforce",
  upstream_provider: "anthropic",
  upstream_model: "claude-opus-5-5",
  violations: [
    { type: "forbidden_tool", tool: "shell_exec", severity: "high", reason: free("policy.violation.reason") },
  ],
};

// The event attribute keys each recorder may emit, and nothing else.
const EVENT_KEYS: Record<string, string[]> = {
  "aip.concern": ["category", "severity"],
  "aip.drift_alert": [],
  "aap.violation": ["severity", "type"],
  "aap.drift_alert": ["agent_id", "alert_type", "card_id", "drift_direction", "similarity_score"],
  "policy.violation": ["severity", "tool", "type"],
};

const RECLASSIFICATION_REASON_KEY = "gen_ai.safety.reclassification.reason";

type Recorded = { name: string; attributes: Record<string, unknown>; events: Array<{ name: string; attributes: Record<string, unknown> }> };

/** Each recorder, driven through one of the two exporter paths. */
interface Recorders {
  integrity(s: IntegritySignalInput): void;
  verification(r: VerificationResultInput): void;
  coherence(r: CoherenceResultInput): void;
  drift(a: DriftAlertInput[]): void;
  reclassification(i: ReclassificationInput): void;
  policy(i: PolicyEvaluationInput): void;
  /** The exported payload as text, and as decoded spans. */
  exported(): Promise<{ raw: string; spans: Recorded[] }>;
}

function workersRecorders(fetchMock: ReturnType<typeof vi.fn>): Recorders {
  const exporter = createWorkersExporter({ endpoint: "https://otel.example.com/v1/traces" });
  return {
    integrity: (s) => exporter.recordIntegrityCheck(s),
    verification: (r) => exporter.recordVerification(r),
    coherence: (r) => exporter.recordCoherence(r),
    drift: (a) => exporter.recordDrift(a, 10),
    reclassification: (i) => exporter.recordReclassification(i),
    policy: (i) => exporter.recordPolicyEvaluation(i),
    async exported() {
      await exporter.flush();
      const raw = fetchMock.mock.calls.map((c) => c[1].body as string).join("\n");
      const decode = (attrs: Array<{ key: string; value: Record<string, unknown> }>) =>
        Object.fromEntries(
          attrs.map((a) => [a.key, "intValue" in a.value ? Number(a.value.intValue) : Object.values(a.value)[0]]),
        );
      const spans: Recorded[] = [];
      for (const call of fetchMock.mock.calls) {
        const body = JSON.parse(call[1].body as string);
        for (const s of body.resourceSpans[0].scopeSpans[0].spans) {
          spans.push({
            name: s.name,
            attributes: decode(s.attributes),
            events: s.events.map((e: { name: string; attributes: Array<{ key: string; value: Record<string, unknown> }> }) => ({
              name: e.name,
              attributes: decode(e.attributes),
            })),
          });
        }
      }
      return { raw, spans };
    },
  };
}

function sdkRecorders(): Recorders {
  const memory = new InMemorySpanExporter();
  const provider = new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(memory)] });
  const tracer: Tracer = provider.getTracer("no-free-text");
  return {
    integrity: (s) => void recordIntegrityCheck(tracer, s),
    verification: (r) => void recordVerification(tracer, r),
    coherence: (r) => void recordCoherence(tracer, r),
    drift: (a) => void recordDrift(tracer, a, 10),
    reclassification: (i) => void recordReclassification(tracer, i),
    policy: (i) => void recordPolicyEvaluation(tracer, i),
    async exported() {
      const spans: Recorded[] = memory.getFinishedSpans().map((s) => ({
        name: s.name,
        attributes: { ...s.attributes },
        events: s.events.map((e) => ({ name: e.name, attributes: { ...(e.attributes ?? {}) } })),
      }));
      return { raw: JSON.stringify(spans), spans };
    },
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(new Response("OK", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const PATHS: Array<[string, () => Recorders]> = [
  ["workers exporter", () => workersRecorders(fetchMock)],
  ["Node SDK recorders", () => sdkRecorders()],
];

describe.each(PATHS)("no free text — %s", (_label, make) => {
  const cases: Array<[string, (r: Recorders) => void, string]> = [
    ["recordIntegrityCheck", (r) => r.integrity(SIGNAL), "aip.integrity_check"],
    ["recordVerification", (r) => r.verification(VERIFICATION), "aap.verify_trace"],
    ["recordCoherence", (r) => r.coherence(COHERENCE), "aap.check_coherence"],
    ["recordDrift", (r) => r.drift(DRIFT), "aap.detect_drift"],
    ["recordReclassification", (r) => r.reclassification(RECLASSIFICATION), "gen_ai.safety.reclassification"],
    ["recordPolicyEvaluation", (r) => r.policy(POLICY), "policy.evaluate"],
  ];

  it.each(cases)("%s exports no free text", async (_name, record, spanName) => {
    const r = make();
    record(r);
    const { raw, spans } = await r.exported();

    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe(spanName);
    expect(raw).not.toContain(FREE);

    for (const event of spans[0].events) {
      expect(Object.keys(event.attributes).sort()).toEqual(EVENT_KEYS[event.name]);
    }
    expect(spans[0].attributes).not.toHaveProperty([RECLASSIFICATION_REASON_KEY]);
  });

  it("keeps the identifiers and operational fields", async () => {
    const r = make();
    r.integrity(SIGNAL);
    r.verification(VERIFICATION);
    r.drift(DRIFT);
    r.reclassification(RECLASSIFICATION);
    r.policy(POLICY);
    const { spans } = await r.exported();
    const byName = Object.fromEntries(spans.map((s) => [s.name, s]));

    const ic = byName["aip.integrity_check"];
    expect(ic.attributes["aip.integrity.checkpoint_id"]).toBe("ic-1");
    expect(ic.attributes["aip.integrity.concerns_count"]).toBe(1);
    expect(ic.attributes["aip.conscience.values_checked_count"]).toBe(1);
    expect(ic.attributes["gen_ai.request.model"]).toBe("claude-opus-5-5");
    expect(ic.events[0].attributes).toEqual({ category: "value_misalignment", severity: "medium" });

    expect(byName["aap.verify_trace"].events[0].attributes).toEqual({ type: "forbidden_action", severity: "critical" });
    expect(byName["aap.detect_drift"].events[0].attributes).toEqual({
      alert_type: "behavioral_drift",
      agent_id: "agent-1",
      card_id: "card-1",
      similarity_score: 0.6,
      drift_direction: "permissive",
    });
    expect(byName["gen_ai.safety.reclassification"].attributes["gen_ai.safety.reclassification.after_classification"]).toBe("card_gap");
    expect(byName["policy.evaluate"].events[0].attributes).toEqual({
      type: "forbidden_tool",
      severity: "high",
      tool: "shell_exec",
    });
  });

  it("drops a named field whose value is not a string, number or boolean", async () => {
    const r = make();
    const err = new Error(free("error.message"));
    r.integrity({
      ...SIGNAL,
      recommended_action: { text: free("object") } as unknown as string,
      checkpoint: {
        ...SIGNAL.checkpoint,
        verdict: [free("array")] as unknown as string,
        agent_id: err as unknown as string,
        concerns: [{ category: { note: free("nested") }, severity: "low" } as never],
      },
    });
    r.policy({
      ...POLICY,
      context: { prompt: free("policy.context") } as unknown as string,
      violations: [{ type: "forbidden_tool", severity: "high", tool: [free("tool")] } as never],
    });
    const { raw, spans } = await r.exported();

    expect(raw).not.toContain(FREE);
    expect(raw).not.toContain("[object Object]");
    const ic = spans.find((s) => s.name === "aip.integrity_check")!;
    expect(ic.attributes).not.toHaveProperty(["aip.integrity.verdict"]);
    expect(ic.attributes).not.toHaveProperty(["aip.integrity.agent_id"]);
    expect(ic.attributes).not.toHaveProperty(["aip.integrity.recommended_action"]);
    expect(ic.events[0].attributes).toEqual({ severity: "low" });
    const pe = spans.find((s) => s.name === "policy.evaluate")!;
    expect(pe.attributes).not.toHaveProperty(["policy.context"]);
    expect(pe.events[0].attributes).toEqual({ type: "forbidden_tool", severity: "high" });
  });
});

describe("scalarAttributes", () => {
  it("keeps strings, numbers and booleans and drops everything else", () => {
    expect(
      scalarAttributes({
        s: "x",
        n: 1.5,
        z: 0,
        b: false,
        u: undefined,
        nul: null,
        o: { a: 1 },
        a: ["x"],
        e: new Error("boom"),
        f: () => 1,
      }),
    ).toEqual({ s: "x", n: 1.5, z: 0, b: false });
  });
});
