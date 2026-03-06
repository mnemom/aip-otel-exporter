/**
 * Records a CLPI policy evaluation as an OpenTelemetry span.
 *
 * Maps 10 attributes: agent_id, policy_id, policy_version, verdict,
 * violations_count, warnings_count, coverage_pct, context, duration_ms,
 * enforcement_mode. Each violation is emitted as a policy.violation event.
 */

import type { Span, Tracer, Attributes } from "@opentelemetry/api";
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
} from "../attributes.js";

import { buildSpan } from "./span-builder.js";

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
  };

  const events: Array<{ name: string; attributes: Attributes }> = [];

  if (input?.violations) {
    for (const violation of input.violations) {
      const eventAttrs: Attributes = {
        type: violation.type,
        severity: violation.severity,
        reason: violation.reason,
      };
      if (violation.tool != null) {
        eventAttrs.tool = violation.tool;
      }
      events.push({
        name: EVENT_POLICY_VIOLATION,
        attributes: eventAttrs,
      });
    }
  }

  return buildSpan(tracer, SPAN_POLICY_EVALUATE, attributes, events);
}
