/**
 * Records a CLPI policy evaluation as an OpenTelemetry span.
 *
 * Maps 10 attributes: agent_id, policy_id, policy_version, verdict,
 * violations_count, warnings_count, coverage_pct, context, duration_ms,
 * enforcement_mode. Each violation is emitted as a policy.violation event
 * carrying its type, severity and tool (never its reason).
 */

import type { Span, Tracer } from "@opentelemetry/api";
import type { PolicyEvaluationInput } from "../types.js";

import {
  SPAN_POLICY_EVALUATE,
  EVENT_POLICY_VIOLATION,
  POLICY_AGENT_ID,
  POLICY_POLICY_ID,
  POLICY_POLICY_VERSION,
  POLICY_VERDICT,
  POLICY_VIOLATIONS_COUNT,
  POLICY_WARNINGS_COUNT,
  POLICY_COVERAGE_PCT,
  POLICY_CONTEXT,
  POLICY_DURATION_MS,
  POLICY_ENFORCEMENT_MODE,
  // OTel GenAI SemConv: upstream provider attribution + Mnemom span role
  GEN_AI_SYSTEM,
  GEN_AI_REQUEST_MODEL,
  MNEMOM_SPAN_ROLE,
} from "../attributes.js";

import { buildRecorderSpan } from "./span-builder.js";

/**
 * Record a policy evaluation as an OTel span with 10 attributes and
 * one event per violation.
 */
export function recordPolicyEvaluation(
  tracer: Tracer,
  input: PolicyEvaluationInput,
): Span {
  const attributes: Record<string, unknown> = {
    [POLICY_AGENT_ID]: input?.agent_id,
    [POLICY_POLICY_ID]: input?.policy_id,
    [POLICY_POLICY_VERSION]: input?.policy_version,
    [POLICY_VERDICT]: input?.verdict,
    [POLICY_VIOLATIONS_COUNT]: input?.violations_count,
    [POLICY_WARNINGS_COUNT]: input?.warnings_count,
    [POLICY_COVERAGE_PCT]: input?.coverage_pct,
    [POLICY_CONTEXT]: input?.context,
    [POLICY_DURATION_MS]: input?.duration_ms,
    [POLICY_ENFORCEMENT_MODE]: input?.enforcement_mode,

    // OTel GenAI SemConv — upstream provider attribution for per-provider
    // SLI-P2 rollups. Reads from caller-supplied fields; the gateway is the
    // canonical caller and threads its routing context through.
    [GEN_AI_SYSTEM]: input?.upstream_provider,
    [GEN_AI_REQUEST_MODEL]: input?.upstream_model,

    // Span role — defaults to "customer" when unset, mirroring
    // recordIntegrityCheck. Verifier-internal and harness paths set explicitly.
    [MNEMOM_SPAN_ROLE]: input?.role ?? "customer",
  };

  const events: Array<{ name: string; attributes: Record<string, unknown> }> = [];

  if (input?.violations) {
    for (const violation of input.violations) {
      // Type, severity and tool name only; the reason is free text.
      const eventAttrs: Record<string, unknown> = {
        type: violation?.type,
        severity: violation?.severity,
      };
      if (violation?.tool != null) {
        eventAttrs.tool = violation.tool;
      }
      events.push({
        name: EVENT_POLICY_VIOLATION,
        attributes: eventAttrs,
      });
    }
  }

  return buildRecorderSpan(tracer, SPAN_POLICY_EVALUATE, attributes, events);
}
