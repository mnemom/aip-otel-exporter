/**
 * Records an AAP VerificationResult as an OpenTelemetry span.
 *
 * Maps 8 attributes (result, similarity_score, violations_count, warnings_count,
 * trace_id, card_id, duration_ms, checks_performed) and emits one EVENT_AAP_VIOLATION
 * event per violation.
 */

import type { Span, Tracer, Attributes } from "@opentelemetry/api";
import type { VerificationResultInput } from "../types.js";

import {
  SPAN_AAP_VERIFY_TRACE,
  EVENT_AAP_VIOLATION,
  AAP_VERIFICATION_RESULT,
  AAP_VERIFICATION_SIMILARITY_SCORE,
  AAP_VERIFICATION_VIOLATIONS_COUNT,
  AAP_VERIFICATION_WARNINGS_COUNT,
  AAP_VERIFICATION_TRACE_ID,
  AAP_VERIFICATION_CARD_ID,
  AAP_VERIFICATION_DURATION_MS,
  AAP_VERIFICATION_CHECKS_PERFORMED,
} from "../attributes.js";

import { buildSpan } from "./span-builder.js";

/**
 * Record a VerificationResult as an OTel span with 8 attributes and per-violation events.
 */
export function recordVerification(
  tracer: Tracer,
  result: VerificationResultInput,
): Span {
  const meta = result?.verification_metadata;

  const attributes: Record<string, unknown> = {
    [AAP_VERIFICATION_RESULT]: result?.verified,
    [AAP_VERIFICATION_SIMILARITY_SCORE]: result?.similarity_score,
    [AAP_VERIFICATION_VIOLATIONS_COUNT]: result?.violations?.length,
    [AAP_VERIFICATION_WARNINGS_COUNT]: result?.warnings?.length,
    [AAP_VERIFICATION_TRACE_ID]: result?.trace_id,
    [AAP_VERIFICATION_CARD_ID]: result?.card_id,
    [AAP_VERIFICATION_DURATION_MS]: meta?.duration_ms,
    [AAP_VERIFICATION_CHECKS_PERFORMED]: meta?.checks_performed?.join(", "),
  };

  const events: Array<{ name: string; attributes: Attributes }> = [];

  if (result?.violations) {
    for (const violation of result.violations) {
      events.push({
        name: EVENT_AAP_VIOLATION,
        attributes: {
          type: violation.type,
          severity: violation.severity,
          description: violation.description,
        },
      });
    }
  }

  return buildSpan(tracer, SPAN_AAP_VERIFY_TRACE, attributes, events);
}
