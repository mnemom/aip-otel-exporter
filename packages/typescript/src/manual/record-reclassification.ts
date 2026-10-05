/**
 * Records a safety reclassification as an OpenTelemetry span.
 *
 * Maps 7 attributes: agent_id, checkpoint_id, trace_id, before_verdict,
 * after_classification, score_before, score_after. The free-text `reason` is
 * not exported.
 */

import type { Span, Tracer } from "@opentelemetry/api";
import type { ReclassificationInput } from "../types.js";

import {
  SPAN_RECLASSIFICATION,
  RECLASSIFICATION_AGENT_ID,
  RECLASSIFICATION_CHECKPOINT_ID,
  RECLASSIFICATION_TRACE_ID,
  RECLASSIFICATION_BEFORE_VERDICT,
  RECLASSIFICATION_AFTER_CLASSIFICATION,
  RECLASSIFICATION_SCORE_BEFORE,
  RECLASSIFICATION_SCORE_AFTER,
} from "../attributes.js";

import { buildRecorderSpan } from "./span-builder.js";

/**
 * Record a reclassification as an OTel span with 7 attributes.
 */
export function recordReclassification(
  tracer: Tracer,
  input: ReclassificationInput,
): Span {
  const attributes: Record<string, unknown> = {
    [RECLASSIFICATION_AGENT_ID]: input?.agent_id,
    [RECLASSIFICATION_CHECKPOINT_ID]: input?.checkpoint_id,
    [RECLASSIFICATION_TRACE_ID]: input?.trace_id,
    [RECLASSIFICATION_BEFORE_VERDICT]: input?.before_verdict,
    [RECLASSIFICATION_AFTER_CLASSIFICATION]: input?.after_classification,
    [RECLASSIFICATION_SCORE_BEFORE]: input?.score_before,
    [RECLASSIFICATION_SCORE_AFTER]: input?.score_after,
  };

  return buildRecorderSpan(tracer, SPAN_RECLASSIFICATION, attributes);
}
