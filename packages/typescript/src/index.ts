/**
 * @mnemom/aip-otel-exporter
 *
 * OpenTelemetry exporter for AIP integrity checkpoints and AAP verification results.
 *
 * Three layers:
 * 1. Manual API (this import) — works everywhere including CF Workers with OTel SDK
 * 2. Auto-instrumentation — import from '@mnemom/aip-otel-exporter/auto'
 * 3. CF Workers adapter — import from '@mnemom/aip-otel-exporter/workers'
 */

import { trace, type Tracer } from "@opentelemetry/api";
// Package version constant — kept in sync with package.json by the release process.
// Using a constant (not a package.json import) for portability across CF Workers.
const PACKAGE_VERSION = "0.7.0";
import { recordIntegrityCheck } from "./manual/record-integrity-check.js";
import { recordVerification } from "./manual/record-verification.js";
import { recordCoherence } from "./manual/record-coherence.js";
import { recordDrift } from "./manual/record-drift.js";
import { recordReclassification } from "./manual/record-reclassification.js";
import { recordPolicyEvaluation } from "./manual/record-policy-evaluation.js";
import type {
  AIPOTelRecorderConfig,
  AIPOTelRecorder,
  IntegritySignalInput,
  VerificationResultInput,
  CoherenceResultInput,
  DriftAlertInput,
  ReclassificationInput,
  PolicyEvaluationInput,
} from "./types.js";

/**
 * Create an AIP OTel Recorder instance.
 *
 * @example
 * ```ts
 * import { createAIPOTelRecorder } from '@mnemom/aip-otel-exporter';
 * const recorder = createAIPOTelRecorder({ tracerProvider });
 * recorder.recordIntegrityCheck(signal);
 * recorder.recordVerification(result);
 * ```
 */
export function createAIPOTelRecorder(
  config?: AIPOTelRecorderConfig
): AIPOTelRecorder {
  const tracerName = config?.tracerName ?? "@mnemom/aip-otel-exporter";
  const tracerVersion = config?.tracerVersion ?? PACKAGE_VERSION;

  const tracer: Tracer = config?.tracerProvider
    ? config.tracerProvider.getTracer(tracerName, tracerVersion)
    : trace.getTracer(tracerName, tracerVersion);

  return {
    recordIntegrityCheck(signal: IntegritySignalInput): void {
      recordIntegrityCheck(tracer, signal);
    },
    recordVerification(result: VerificationResultInput): void {
      recordVerification(tracer, result);
    },
    recordCoherence(result: CoherenceResultInput): void {
      recordCoherence(tracer, result);
    },
    recordDrift(alerts: DriftAlertInput[], tracesAnalyzed?: number): void {
      recordDrift(tracer, alerts, tracesAnalyzed);
    },
    recordReclassification(input: ReclassificationInput): void {
      recordReclassification(tracer, input);
    },
    recordPolicyEvaluation(input: PolicyEvaluationInput): void {
      recordPolicyEvaluation(tracer, input);
    },
  };
}

// Re-export types
export type {
  AIPOTelRecorderConfig,
  AIPOTelRecorder,
  IntegritySignalInput,
  VerificationResultInput,
  CoherenceResultInput,
  DriftAlertInput,
  ConcernInput,
  ViolationInput,
  WarningInput,
  WindowSummaryInput,
  CheckpointInput,
  ConscienceContextInput,
  AnalysisMetadataInput,
  AttestationInput,
  VerificationMetadataInput,
  ValueAlignmentInput,
  DriftAnalysisInput,
  IntegrityDriftAlertInput,
  ReclassificationInput,
  PolicyEvaluationInput,
  PolicyViolationInput,
  OutputAnalysisInput,
  WorkersExporterConfig,
  WorkersOTelExporter,
} from "./types.js";

// Re-export attribute constants
export * from "./attributes.js";

// Re-export manual API functions (for advanced use)
export { recordIntegrityCheck } from "./manual/record-integrity-check.js";
export { recordVerification } from "./manual/record-verification.js";
export { recordCoherence } from "./manual/record-coherence.js";
export { recordDrift } from "./manual/record-drift.js";
export { recordReclassification } from "./manual/record-reclassification.js";
export { recordPolicyEvaluation } from "./manual/record-policy-evaluation.js";
export { buildSpan } from "./manual/span-builder.js";

// Re-export metrics
export {
  createAIPMetrics,
  recordIntegrityMetrics,
  recordVerificationMetrics,
  recordCoherenceMetrics,
  recordDriftMetrics,
} from "./metrics/integrity-metrics.js";
export type { AIPMetrics } from "./metrics/integrity-metrics.js";
