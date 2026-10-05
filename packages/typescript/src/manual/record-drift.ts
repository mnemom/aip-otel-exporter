/**
 * Records AAP drift detection as an OpenTelemetry span.
 *
 * Sets alerts_count and traces_analyzed as span attributes, then emits one
 * EVENT_AAP_DRIFT_ALERT event per alert with type, agent, card, similarity,
 * and direction. The recommendation and indicator descriptions are free text
 * and are not exported.
 */

import type { Span, Tracer } from "@opentelemetry/api";
import type { DriftAlertInput } from "../types.js";

import {
  SPAN_AAP_DETECT_DRIFT,
  EVENT_AAP_DRIFT_ALERT,
  AAP_DRIFT_ALERTS_COUNT,
  AAP_DRIFT_TRACES_ANALYZED,
} from "../attributes.js";

import { buildRecorderSpan } from "./span-builder.js";

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

  const events: Array<{ name: string; attributes: Record<string, unknown> }> = [];

  if (alerts) {
    for (const alert of alerts) {
      events.push({
        name: EVENT_AAP_DRIFT_ALERT,
        attributes: {
          alert_type: alert?.alert_type,
          agent_id: alert?.agent_id,
          card_id: alert?.card_id,
          similarity_score: alert?.analysis?.similarity_score,
          drift_direction: alert?.analysis?.drift_direction,
        },
      });
    }
  }

  return buildRecorderSpan(tracer, SPAN_AAP_DETECT_DRIFT, attributes, events);
}
