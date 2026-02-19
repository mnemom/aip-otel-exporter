/**
 * Cloudflare Workers OTLP exporter for AIP/AAP telemetry.
 *
 * Implements the `WorkersOTelExporter` interface from types.ts using only
 * `fetch()` and the OTLP JSON serializer -- zero dependency on the OTel SDK.
 *
 * Usage:
 * ```ts
 * import { createWorkersExporter } from "@mnemom/aip-otel-exporter/workers";
 *
 * const exporter = createWorkersExporter({
 *   endpoint: "https://otel-collector.example.com/v1/traces",
 *   authorization: "Bearer <token>",
 * });
 *
 * exporter.recordIntegrityCheck(signal);
 * ctx.waitUntil(exporter.flush());
 * ```
 */

import type {
  WorkersExporterConfig,
  WorkersOTelExporter,
  IntegritySignalInput,
  VerificationResultInput,
  CoherenceResultInput,
  DriftAlertInput,
} from "../types.js";

import {
  // Span & event names
  SPAN_AIP_INTEGRITY_CHECK,
  SPAN_AAP_VERIFY_TRACE,
  SPAN_AAP_CHECK_COHERENCE,
  SPAN_AAP_DETECT_DRIFT,
  EVENT_AIP_CONCERN,
  EVENT_AIP_DRIFT_ALERT,
  EVENT_AAP_VIOLATION,
  EVENT_AAP_DRIFT_ALERT,

  // AIP Integrity Check attributes
  AIP_INTEGRITY_CHECKPOINT_ID,
  AIP_INTEGRITY_VERDICT,
  AIP_INTEGRITY_AGENT_ID,
  AIP_INTEGRITY_CARD_ID,
  AIP_INTEGRITY_SESSION_ID,
  AIP_INTEGRITY_THINKING_HASH,
  AIP_INTEGRITY_PROCEED,
  AIP_INTEGRITY_RECOMMENDED_ACTION,
  AIP_INTEGRITY_CONCERNS_COUNT,
  AIP_INTEGRITY_ANALYSIS_MODEL,
  AIP_INTEGRITY_ANALYSIS_DURATION_MS,
  AIP_INTEGRITY_THINKING_TOKENS,
  AIP_INTEGRITY_TRUNCATED,
  AIP_INTEGRITY_EXTRACTION_CONFIDENCE,

  // Conscience context attributes
  AIP_CONSCIENCE_CONSULTATION_DEPTH,
  AIP_CONSCIENCE_VALUES_CHECKED_COUNT,
  AIP_CONSCIENCE_CONFLICTS_COUNT,

  // Attestation attributes
  AIP_ATTESTATION_INPUT_COMMITMENT,
  AIP_ATTESTATION_CHAIN_HASH,
  AIP_ATTESTATION_MERKLE_ROOT,
  AIP_ATTESTATION_SIGNATURE_VERIFIED,
  AIP_ATTESTATION_CERTIFICATE_ID,
  AIP_ATTESTATION_ZK_PROVEN,
  AIP_ATTESTATION_ZK_PROOF_TIME_MS,

  // Window summary attributes
  AIP_WINDOW_SIZE,
  AIP_WINDOW_INTEGRITY_RATIO,
  AIP_WINDOW_DRIFT_ALERT_ACTIVE,

  // GenAI SIG forward-compat aliases
  GEN_AI_EVALUATION_VERDICT,
  GEN_AI_EVALUATION_SCORE,

  // AAP Verification attributes
  AAP_VERIFICATION_RESULT,
  AAP_VERIFICATION_SIMILARITY_SCORE,
  AAP_VERIFICATION_VIOLATIONS_COUNT,
  AAP_VERIFICATION_WARNINGS_COUNT,
  AAP_VERIFICATION_TRACE_ID,
  AAP_VERIFICATION_CARD_ID,
  AAP_VERIFICATION_DURATION_MS,
  AAP_VERIFICATION_CHECKS_PERFORMED,

  // AAP Coherence attributes
  AAP_COHERENCE_COMPATIBLE,
  AAP_COHERENCE_SCORE,
  AAP_COHERENCE_PROCEED,
  AAP_COHERENCE_MATCHED_COUNT,
  AAP_COHERENCE_CONFLICT_COUNT,

  // AAP Drift attributes
  AAP_DRIFT_ALERTS_COUNT,
  AAP_DRIFT_TRACES_ANALYZED,
} from "../attributes.js";

import type { OTLPSpan } from "./otlp-serializer.js";
import { createOTLPSpan, serializeExportPayload } from "./otlp-serializer.js";

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a CF Workers-compatible OTLP exporter that buffers spans in memory
 * and flushes them via `fetch()`.
 */
export function createWorkersExporter(
  config: WorkersExporterConfig,
): WorkersOTelExporter {
  const serviceName = config.serviceName ?? "aip-otel-exporter";
  const maxBatchSize = config.maxBatchSize ?? 100;

  let buffer: OTLPSpan[] = [];

  // -------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------

  function pushSpan(span: OTLPSpan): void {
    buffer.push(span);
    if (buffer.length >= maxBatchSize) {
      // Fire-and-forget auto-flush; callers should still use ctx.waitUntil(flush())
      void flush();
    }
  }

  // -------------------------------------------------------------------
  // flush()
  // -------------------------------------------------------------------

  async function flush(): Promise<void> {
    if (buffer.length === 0) return;

    const spans = buffer;
    buffer = [];

    const body = serializeExportPayload(spans, serviceName);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...config.headers,
    };

    if (config.authorization) {
      headers["Authorization"] = config.authorization;
    }

    await fetch(config.endpoint, {
      method: "POST",
      headers,
      body,
    });
  }

  // -------------------------------------------------------------------
  // recordIntegrityCheck
  // -------------------------------------------------------------------

  function recordIntegrityCheck(signal: IntegritySignalInput): void {
    const cp = signal?.checkpoint;
    const meta = cp?.analysis_metadata;
    const conscience = cp?.conscience_context;
    const att = cp?.attestation;
    const win = signal?.window_summary;

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
      [AIP_CONSCIENCE_VALUES_CHECKED_COUNT]:
        conscience?.values_checked?.length,
      [AIP_CONSCIENCE_CONFLICTS_COUNT]: conscience?.conflicts?.length,

      // Attestation
      [AIP_ATTESTATION_INPUT_COMMITMENT]: att?.input_commitment,
      [AIP_ATTESTATION_CHAIN_HASH]: att?.chain_hash,
      [AIP_ATTESTATION_MERKLE_ROOT]: att?.merkle_root,
      [AIP_ATTESTATION_SIGNATURE_VERIFIED]: att?.signature_verified,
      [AIP_ATTESTATION_CERTIFICATE_ID]: att?.certificate_id,
      [AIP_ATTESTATION_ZK_PROVEN]: att?.zk_proven,
      [AIP_ATTESTATION_ZK_PROOF_TIME_MS]: att?.zk_proof_time_ms,

      // Window summary
      [AIP_WINDOW_SIZE]: win?.size,
      [AIP_WINDOW_INTEGRITY_RATIO]: win?.integrity_ratio,
      [AIP_WINDOW_DRIFT_ALERT_ACTIVE]: win?.drift_alert_active,

      // GenAI SIG forward-compat aliases
      [GEN_AI_EVALUATION_VERDICT]: cp?.verdict,
      [GEN_AI_EVALUATION_SCORE]: win?.integrity_ratio,
    };

    const events: Array<{ name: string; attributes: Record<string, unknown> }> =
      [];

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

    pushSpan(createOTLPSpan(SPAN_AIP_INTEGRITY_CHECK, attributes, events));
  }

  // -------------------------------------------------------------------
  // recordVerification
  // -------------------------------------------------------------------

  function recordVerification(result: VerificationResultInput): void {
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

    const events: Array<{ name: string; attributes: Record<string, unknown> }> =
      [];

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

    pushSpan(createOTLPSpan(SPAN_AAP_VERIFY_TRACE, attributes, events));
  }

  // -------------------------------------------------------------------
  // recordCoherence
  // -------------------------------------------------------------------

  function recordCoherence(result: CoherenceResultInput): void {
    const attributes: Record<string, unknown> = {
      [AAP_COHERENCE_COMPATIBLE]: result?.compatible,
      [AAP_COHERENCE_SCORE]: result?.score,
      [AAP_COHERENCE_PROCEED]: result?.proceed,
      [AAP_COHERENCE_MATCHED_COUNT]: result?.value_alignment?.matched?.length,
      [AAP_COHERENCE_CONFLICT_COUNT]:
        result?.value_alignment?.conflicts?.length,
    };

    pushSpan(createOTLPSpan(SPAN_AAP_CHECK_COHERENCE, attributes));
  }

  // -------------------------------------------------------------------
  // recordDrift
  // -------------------------------------------------------------------

  function recordDrift(
    alerts: DriftAlertInput[],
    tracesAnalyzed?: number,
  ): void {
    const attributes: Record<string, unknown> = {
      [AAP_DRIFT_ALERTS_COUNT]: alerts?.length,
      [AAP_DRIFT_TRACES_ANALYZED]: tracesAnalyzed,
    };

    const events: Array<{ name: string; attributes: Record<string, unknown> }> =
      [];

    if (alerts) {
      for (const alert of alerts) {
        const eventAttrs: Record<string, unknown> = {};
        if (alert?.alert_type != null) eventAttrs.alert_type = alert.alert_type;
        if (alert?.agent_id != null) eventAttrs.agent_id = alert.agent_id;
        if (alert?.card_id != null) eventAttrs.card_id = alert.card_id;
        if (alert?.analysis?.similarity_score != null)
          eventAttrs.similarity_score = alert.analysis.similarity_score;
        if (alert?.analysis?.drift_direction != null)
          eventAttrs.drift_direction = alert.analysis.drift_direction;
        if (alert?.recommendation != null)
          eventAttrs.recommendation = alert.recommendation;

        events.push({
          name: EVENT_AAP_DRIFT_ALERT,
          attributes: eventAttrs,
        });
      }
    }

    pushSpan(createOTLPSpan(SPAN_AAP_DETECT_DRIFT, attributes, events));
  }

  // -------------------------------------------------------------------
  // Public interface
  // -------------------------------------------------------------------

  return {
    recordIntegrityCheck,
    recordVerification,
    recordCoherence,
    recordDrift,
    flush,
  };
}
