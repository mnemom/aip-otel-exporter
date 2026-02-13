/**
 * Records an AAP CoherenceResult as an OpenTelemetry span.
 *
 * Maps 5 attributes: compatible, score, proceed, matched_count, conflict_count.
 */

import type { Span, Tracer } from "@opentelemetry/api";
import type { CoherenceResultInput } from "../types.js";

import {
  SPAN_AAP_CHECK_COHERENCE,
  AAP_COHERENCE_COMPATIBLE,
  AAP_COHERENCE_SCORE,
  AAP_COHERENCE_PROCEED,
  AAP_COHERENCE_MATCHED_COUNT,
  AAP_COHERENCE_CONFLICT_COUNT,
} from "../attributes.js";

import { buildSpan } from "./span-builder.js";

/**
 * Record a CoherenceResult as an OTel span with 5 attributes.
 */
export function recordCoherence(
  tracer: Tracer,
  result: CoherenceResultInput,
): Span {
  const attributes: Record<string, unknown> = {
    [AAP_COHERENCE_COMPATIBLE]: result?.compatible,
    [AAP_COHERENCE_SCORE]: result?.score,
    [AAP_COHERENCE_PROCEED]: result?.proceed,
    [AAP_COHERENCE_MATCHED_COUNT]: result?.value_alignment?.matched?.length,
    [AAP_COHERENCE_CONFLICT_COUNT]: result?.value_alignment?.conflicts?.length,
  };

  return buildSpan(tracer, SPAN_AAP_CHECK_COHERENCE, attributes);
}
