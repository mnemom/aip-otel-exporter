import { describe, it, expect, beforeEach } from "vitest";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import { SpanKind } from "@opentelemetry/api";
import { recordPolicyEvaluation } from "../../src/manual/record-policy-evaluation.js";
import * as attr from "../../src/attributes.js";
import type { PolicyEvaluationInput } from "../../src/types.js";

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const FIXTURE_INPUT: PolicyEvaluationInput = {
  agent_id: "agent-1",
  policy_id: "policy-clpi-tools",
  policy_version: "v2",
  verdict: "allow",
  violations_count: 0,
  warnings_count: 1,
  coverage_pct: 100,
  context: "tool_use",
  duration_ms: 12.4,
  enforcement_mode: "enforce",
  violations: [],
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

describe("recordPolicyEvaluation", () => {
  beforeEach(() => {
    setup();
  });

  it("should create a span with correct name", () => {
    const tracer = provider.getTracer("test");
    recordPolicyEvaluation(tracer, FIXTURE_INPUT);

    const spans = getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe("policy.evaluate");
    expect(spans[0].kind).toBe(SpanKind.INTERNAL);
  });

  it("should set core policy attributes from the input", () => {
    const tracer = provider.getTracer("test");
    recordPolicyEvaluation(tracer, FIXTURE_INPUT);

    const a = getFinishedSpans()[0].attributes;
    expect(a[attr.POLICY_AGENT_ID]).toBe("agent-1");
    expect(a[attr.POLICY_POLICY_ID]).toBe("policy-clpi-tools");
    expect(a[attr.POLICY_POLICY_VERSION]).toBe("v2");
    expect(a[attr.POLICY_VERDICT]).toBe("allow");
    expect(a[attr.POLICY_VIOLATIONS_COUNT]).toBe(0);
    expect(a[attr.POLICY_WARNINGS_COUNT]).toBe(1);
    expect(a[attr.POLICY_COVERAGE_PCT]).toBe(100);
    expect(a[attr.POLICY_CONTEXT]).toBe("tool_use");
    expect(a[attr.POLICY_DURATION_MS]).toBe(12.4);
    expect(a[attr.POLICY_ENFORCEMENT_MODE]).toBe("enforce");
  });

  it("should set gen_ai.system + gen_ai.request.model when input carries upstream provider/model", () => {
    const tracer = provider.getTracer("test");
    recordPolicyEvaluation(tracer, {
      ...FIXTURE_INPUT,
      upstream_provider: "openai",
      upstream_model: "gpt-5",
    });

    const a = getFinishedSpans()[0].attributes;
    expect(a[attr.GEN_AI_SYSTEM]).toBe("openai");
    expect(a[attr.GEN_AI_REQUEST_MODEL]).toBe("gpt-5");
  });

  it("should default mnemom.span.role to 'customer' when input omits role", () => {
    const tracer = provider.getTracer("test");
    recordPolicyEvaluation(tracer, FIXTURE_INPUT);

    const a = getFinishedSpans()[0].attributes;
    expect(a[attr.MNEMOM_SPAN_ROLE]).toBe("customer");
  });

  it("should honor explicit role values for verifier and harness paths", () => {
    const tracer = provider.getTracer("test");
    recordPolicyEvaluation(tracer, { ...FIXTURE_INPUT, role: "verifier" });
    recordPolicyEvaluation(tracer, { ...FIXTURE_INPUT, role: "harness" });

    const spans = getFinishedSpans();
    expect(spans[0].attributes[attr.MNEMOM_SPAN_ROLE]).toBe("verifier");
    expect(spans[1].attributes[attr.MNEMOM_SPAN_ROLE]).toBe("harness");
  });

  it("should leave gen_ai.system / gen_ai.request.model unset when input omits upstream provider/model", () => {
    const tracer = provider.getTracer("test");
    recordPolicyEvaluation(tracer, FIXTURE_INPUT);

    const a = getFinishedSpans()[0].attributes;
    expect(a[attr.GEN_AI_SYSTEM]).toBeUndefined();
    expect(a[attr.GEN_AI_REQUEST_MODEL]).toBeUndefined();
  });

  it("should emit one policy.violation event per violation in the input", () => {
    const tracer = provider.getTracer("test");
    recordPolicyEvaluation(tracer, {
      ...FIXTURE_INPUT,
      violations_count: 2,
      violations: [
        { type: "forbidden_tool", tool: "shell_exec", severity: "high", reason: "shell access blocked" },
        { type: "scope_breach", severity: "medium", reason: "scope outside policy" },
      ],
    });

    const events = getFinishedSpans()[0].events;
    expect(events).toHaveLength(2);
    expect(events[0].name).toBe("policy.violation");
    expect(events[0].attributes?.["type"]).toBe("forbidden_tool");
    expect(events[0].attributes?.["tool"]).toBe("shell_exec");
    expect(events[1].attributes?.["type"]).toBe("scope_breach");
    expect(events[1].attributes?.["tool"]).toBeUndefined();
  });

  it("should handle a minimal input without throwing", () => {
    const tracer = provider.getTracer("test");
    recordPolicyEvaluation(tracer, {});

    const spans = getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe("policy.evaluate");
    expect(spans[0].attributes[attr.MNEMOM_SPAN_ROLE]).toBe("customer");
  });
});
