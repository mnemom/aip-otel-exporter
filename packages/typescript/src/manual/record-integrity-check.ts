/**
 * Records an AIP IntegritySignal as an OpenTelemetry span.
 *
 * Maps all 22 planned attributes from the checkpoint, signal, analysis_metadata,
 * conscience_context, and window_summary onto a single INTERNAL span.
 * Concerns are emitted as individual span events, and a drift alert event is
 * added when the window summary indicates active drift.
 */

import type { Span, Tracer, Attributes } from "@opentelemetry/api";
import type { IntegritySignalInput } from "../types.js";

import {
  // Span & event names
  SPAN_AIP_INTEGRITY_CHECK,
  EVENT_AIP_CONCERN,
  EVENT_AIP_DRIFT_ALERT,

  // Checkpoint attributes
  AIP_INTEGRITY_CHECKPOINT_ID,
  AIP_INTEGRITY_VERDICT,
  AIP_INTEGRITY_AGENT_ID,
  AIP_INTEGRITY_CARD_ID,
  AIP_INTEGRITY_SESSION_ID,
  AIP_INTEGRITY_THINKING_HASH,

  // Signal-level attributes
  AIP_INTEGRITY_PROCEED,
  AIP_INTEGRITY_RECOMMENDED_ACTION,
  AIP_INTEGRITY_CONCERNS_COUNT,

  // Analysis metadata attributes
  AIP_INTEGRITY_ANALYSIS_MODEL,
  AIP_INTEGRITY_ANALYSIS_DURATION_MS,
  AIP_INTEGRITY_THINKING_TOKENS,
  AIP_INTEGRITY_TRUNCATED,
  AIP_INTEGRITY_EXTRACTION_CONFIDENCE,

  // Conscience context attributes
  AIP_CONSCIENCE_CONSULTATION_DEPTH,
  AIP_CONSCIENCE_VALUES_CHECKED_COUNT,
  AIP_CONSCIENCE_CONFLICTS_COUNT,

  // Window summary attributes
  AIP_WINDOW_SIZE,
  AIP_WINDOW_INTEGRITY_RATIO,
  AIP_WINDOW_DRIFT_ALERT_ACTIVE,

  // GenAI forward-compat aliases
  GEN_AI_EVALUATION_VERDICT,
  GEN_AI_EVALUATION_SCORE,
} from "../attributes.js";

import { buildSpan } from "./span-builder.js";

/**
 * Record an IntegritySignal as an OTel span with all 22 attributes, concern
 * events, and an optional drift alert event.
 *
 * All inputs are duck-typed -- every field is accessed via optional chaining so
 * missing data is silently skipped rather than throwing.
 */
export function recordIntegrityCheck(
  tracer: Tracer,
  signal: IntegritySignalInput,
): Span {
  const cp = signal?.checkpoint;
  const meta = cp?.analysis_metadata;
  const conscience = cp?.conscience_context;
  const win = signal?.window_summary;

  // --- Attributes (22 domain + 2 GenAI aliases) ---

  const attributes: Record<string, unknown> = {
    // Checkpoint
    [AIP_INTEGRITY_CHECKPOINT_ID]: cp?.checkpoint_id,
    [AIP_INTEGRITY_VERDICT]: cp?.verdict,
    [AIP_INTEGRITY_AGENT_ID]: cp?.agent_id,
    [AIP_INTEGRITY_CARD_ID]: cp?.card_id,
    [AIP_INTEGRITY_SESSION_ID]: cp?.session_id,
    [AIP_INTEGRITY_THINKING_HASH]: cp?.thinking_block_hash,

    // Signal
    [AIP_INTEGRITY_PROCEED]: signal?.proceed,
    [AIP_INTEGRITY_RECOMMENDED_ACTION]: signal?.recommended_action,
    [AIP_INTEGRITY_CONCERNS_COUNT]: cp?.concerns?.length,

    // Analysis metadata
    [AIP_INTEGRITY_ANALYSIS_MODEL]: meta?.analysis_model,
    [AIP_INTEGRITY_ANALYSIS_DURATION_MS]: meta?.analysis_duration_ms,
    [AIP_INTEGRITY_THINKING_TOKENS]: meta?.thinking_tokens_original,
    [AIP_INTEGRITY_TRUNCATED]: meta?.truncated,
    [AIP_INTEGRITY_EXTRACTION_CONFIDENCE]: meta?.extraction_confidence,

    // Conscience context
    [AIP_CONSCIENCE_CONSULTATION_DEPTH]: conscience?.consultation_depth,
    [AIP_CONSCIENCE_VALUES_CHECKED_COUNT]: conscience?.values_checked?.length,
    [AIP_CONSCIENCE_CONFLICTS_COUNT]: conscience?.conflicts?.length,

    // Window summary
    [AIP_WINDOW_SIZE]: win?.size,
    [AIP_WINDOW_INTEGRITY_RATIO]: win?.integrity_ratio,
    [AIP_WINDOW_DRIFT_ALERT_ACTIVE]: win?.drift_alert_active,

    // GenAI SIG forward-compat aliases
    [GEN_AI_EVALUATION_VERDICT]: cp?.verdict,
    [GEN_AI_EVALUATION_SCORE]: win?.integrity_ratio,
  };

  // --- Events ---

  const events: Array<{ name: string; attributes: Attributes }> = [];

  // One event per concern
  if (cp?.concerns) {
    for (const concern of cp.concerns) {
      events.push({
        name: EVENT_AIP_CONCERN,
        attributes: {
          category: concern.category,
          severity: concern.severity,
          description: concern.description,
        },
      });
    }
  }

  // Drift alert event when drift is active
  if (win?.drift_alert_active) {
    events.push({
      name: EVENT_AIP_DRIFT_ALERT,
      attributes: {},
    });
  }

  return buildSpan(tracer, SPAN_AIP_INTEGRITY_CHECK, attributes, events);
}
