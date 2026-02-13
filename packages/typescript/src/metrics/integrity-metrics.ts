/**
 * AIP/AAP metrics using OpenTelemetry Metrics API.
 *
 * Provides counters and histograms for integrity checks, verification results,
 * concerns, violations, and performance metrics.
 */

import type {
  MeterProvider,
  Meter,
  Counter,
  Histogram,
} from "@opentelemetry/api";
import { metrics } from "@opentelemetry/api";
import {
  METRIC_AIP_INTEGRITY_CHECKS_TOTAL,
  METRIC_AIP_CONCERNS_TOTAL,
  METRIC_AIP_ANALYSIS_DURATION,
  METRIC_AIP_WINDOW_INTEGRITY_RATIO,
  METRIC_AIP_DRIFT_ALERTS_TOTAL,
  METRIC_AAP_VERIFICATIONS_TOTAL,
  METRIC_AAP_VIOLATIONS_TOTAL,
  METRIC_AAP_VERIFICATION_DURATION,
  METRIC_AAP_COHERENCE_SCORE,
} from "../attributes.js";
import type {
  IntegritySignalInput,
  VerificationResultInput,
  CoherenceResultInput,
  DriftAlertInput,
} from "../types.js";

/** Collection of AIP/AAP metric instruments. */
export interface AIPMetrics {
  integrityChecks: Counter;
  concerns: Counter;
  analysisDuration: Histogram;
  integrityRatio: Histogram;
  driftAlerts: Counter;
  verifications: Counter;
  violations: Counter;
  verificationDuration: Histogram;
  coherenceScore: Histogram;
}

/**
 * Create AIP/AAP metric instruments.
 *
 * @param meterProvider - OTel MeterProvider. Falls back to global if not set.
 * @returns Collection of metric instruments ready for recording.
 */
export function createAIPMetrics(meterProvider?: MeterProvider): AIPMetrics {
  const meter: Meter = meterProvider
    ? meterProvider.getMeter("@mnemom/aip-otel-exporter", "0.1.0")
    : metrics.getMeter("@mnemom/aip-otel-exporter", "0.1.0");

  return {
    integrityChecks: meter.createCounter(METRIC_AIP_INTEGRITY_CHECKS_TOTAL, {
      description: "Total AIP integrity checks performed",
    }),
    concerns: meter.createCounter(METRIC_AIP_CONCERNS_TOTAL, {
      description: "Total AIP concerns raised",
    }),
    analysisDuration: meter.createHistogram(METRIC_AIP_ANALYSIS_DURATION, {
      description: "AIP analysis duration in milliseconds",
      unit: "ms",
    }),
    integrityRatio: meter.createHistogram(METRIC_AIP_WINDOW_INTEGRITY_RATIO, {
      description: "Window integrity ratio (0.0 to 1.0)",
    }),
    driftAlerts: meter.createCounter(METRIC_AIP_DRIFT_ALERTS_TOTAL, {
      description: "Total AIP drift alerts generated",
    }),
    verifications: meter.createCounter(METRIC_AAP_VERIFICATIONS_TOTAL, {
      description: "Total AAP verifications performed",
    }),
    violations: meter.createCounter(METRIC_AAP_VIOLATIONS_TOTAL, {
      description: "Total AAP violations detected",
    }),
    verificationDuration: meter.createHistogram(
      METRIC_AAP_VERIFICATION_DURATION,
      {
        description: "AAP verification duration in milliseconds",
        unit: "ms",
      }
    ),
    coherenceScore: meter.createHistogram(METRIC_AAP_COHERENCE_SCORE, {
      description: "AAP coherence score (0.0 to 1.0)",
    }),
  };
}

/**
 * Record metrics from an AIP integrity signal.
 */
export function recordIntegrityMetrics(
  m: AIPMetrics,
  signal: IntegritySignalInput
): void {
  const verdict = signal.checkpoint?.verdict ?? "unknown";
  const agentId = signal.checkpoint?.agent_id;

  const attrs: Record<string, string> = { verdict };
  if (agentId) attrs.agent_id = agentId;

  m.integrityChecks.add(1, attrs);

  const concernsCount = signal.checkpoint?.concerns?.length ?? 0;
  if (concernsCount > 0) {
    for (const concern of signal.checkpoint!.concerns!) {
      m.concerns.add(1, {
        category: concern.category,
        severity: concern.severity,
        ...attrs,
      });
    }
  }

  const duration = signal.checkpoint?.analysis_metadata?.analysis_duration_ms;
  if (duration != null) {
    m.analysisDuration.record(duration, attrs);
  }

  const ratio = signal.window_summary?.integrity_ratio;
  if (ratio != null) {
    m.integrityRatio.record(ratio, attrs);
  }

  if (signal.window_summary?.drift_alert_active) {
    m.driftAlerts.add(1, attrs);
  }
}

/**
 * Record metrics from an AAP verification result.
 */
export function recordVerificationMetrics(
  m: AIPMetrics,
  result: VerificationResultInput
): void {
  const attrs: Record<string, string | boolean> = {
    verified: String(result.verified ?? false),
  };
  if (result.card_id) attrs.card_id = result.card_id;

  m.verifications.add(1, attrs);

  const violationsCount = result.violations?.length ?? 0;
  if (violationsCount > 0) {
    for (const violation of result.violations!) {
      m.violations.add(1, {
        type: violation.type,
        severity: violation.severity,
      });
    }
  }

  const duration = result.verification_metadata?.duration_ms;
  if (duration != null) {
    m.verificationDuration.record(duration, attrs);
  }
}

/**
 * Record metrics from an AAP coherence result.
 */
export function recordCoherenceMetrics(
  m: AIPMetrics,
  result: CoherenceResultInput
): void {
  if (result.score != null) {
    m.coherenceScore.record(result.score, {
      compatible: String(result.compatible ?? false),
    });
  }
}

/**
 * Record metrics from AAP drift alerts.
 */
export function recordDriftMetrics(
  m: AIPMetrics,
  alerts: DriftAlertInput[]
): void {
  for (const alert of alerts) {
    m.driftAlerts.add(1, {
      drift_direction: alert.analysis?.drift_direction ?? "unknown",
      agent_id: alert.agent_id ?? "unknown",
    });
  }
}
