/**
 * Records AAP drift detection as an OpenTelemetry span.
 *
 * Sets alerts_count and traces_analyzed as span attributes, then emits one
 * EVENT_AAP_DRIFT_ALERT event per alert with type, agent, card, similarity,
 * direction, and recommendation.
 */

import type { Span, Tracer, Attributes } from "@opentelemetry/api";
import type { DriftAlertInput } from "../types.js";

import {
  SPAN_AAP_DETECT_DRIFT,
  EVENT_AAP_DRIFT_ALERT,
  AAP_DRIFT_ALERTS_COUNT,
  AAP_DRIFT_TRACES_ANALYZED,
} from "../attributes.js";

import { buildSpan } from "./span-builder.js";

/**
 * Record drift detection as an OTel span with per-alert events.
 */
export function recordDrift(
  tracer: Tracer,
  alerts: DriftAlertInput[],
  tracesAnalyzed?: number,
): Span {
  const attributes: Record<string, unknown> = {
    [AAP_DRIFT_ALERTS_COUNT]: alerts?.length,
    [AAP_DRIFT_TRACES_ANALYZED]: tracesAnalyzed,
  };

  const events: Array<{ name: string; attributes: Attributes }> = [];

  if (alerts) {
    for (const alert of alerts) {
      events.push({
        name: EVENT_AAP_DRIFT_ALERT,
        attributes: {
          ...(alert?.alert_type !== undefined &&
            alert?.alert_type !== null && { alert_type: alert.alert_type }),
          ...(alert?.agent_id !== undefined &&
            alert?.agent_id !== null && { agent_id: alert.agent_id }),
          ...(alert?.card_id !== undefined &&
            alert?.card_id !== null && { card_id: alert.card_id }),
          ...(alert?.analysis?.similarity_score !== undefined &&
            alert?.analysis?.similarity_score !== null && {
              similarity_score: alert.analysis.similarity_score,
            }),
          ...(alert?.analysis?.drift_direction !== undefined &&
            alert?.analysis?.drift_direction !== null && {
              drift_direction: alert.analysis.drift_direction,
            }),
          ...(alert?.recommendation !== undefined &&
            alert?.recommendation !== null && {
              recommendation: alert.recommendation,
            }),
        },
      });
    }
  }

  return buildSpan(tracer, SPAN_AAP_DETECT_DRIFT, attributes, events);
}
