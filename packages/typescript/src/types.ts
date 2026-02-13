/**
 * Configuration and duck-typed input types for the AIP OTel Exporter.
 *
 * All input types are duck-typed (no hard imports from AIP/AAP packages).
 * Fields use optional chaining for graceful handling of missing data.
 */

import type { TracerProvider, Tracer } from "@opentelemetry/api";

// --- Configuration ---

/** Configuration for the AIP OTel Recorder. */
export interface AIPOTelRecorderConfig {
  /** OTel TracerProvider to use. Falls back to global provider if not set. */
  tracerProvider?: TracerProvider;
  /** Custom tracer name. Defaults to "@mnemom/aip-otel-exporter". */
  tracerName?: string;
  /** Custom tracer version. Defaults to package version. */
  tracerVersion?: string;
}

/** Configuration for the CF Workers exporter. */
export interface WorkersExporterConfig {
  /** OTLP endpoint URL (e.g., "https://otel-collector.example.com/v1/traces"). */
  endpoint: string;
  /** Authorization header value (e.g., "Bearer <token>"). */
  authorization?: string;
  /** Additional headers to include in the OTLP request. */
  headers?: Record<string, string>;
  /** Service name for the resource. Defaults to "aip-otel-exporter". */
  serviceName?: string;
  /** Maximum batch size before auto-flush. Defaults to 100. */
  maxBatchSize?: number;
}

// --- Duck-typed AIP inputs ---

/** Duck-typed IntegrityConcern (matches AIP's IntegrityConcern shape). */
export interface ConcernInput {
  category: string;
  severity: string;
  description: string;
  evidence?: string;
  relevant_card_field?: string | null;
  relevant_conscience_value?: string | null;
}

/** Duck-typed ConscienceContext. */
export interface ConscienceContextInput {
  consultation_depth?: string;
  values_checked?: string[];
  conflicts?: string[];
  supports?: string[];
  considerations?: string[];
}

/** Duck-typed AnalysisMetadata. */
export interface AnalysisMetadataInput {
  analysis_model?: string;
  analysis_duration_ms?: number;
  thinking_tokens_original?: number;
  thinking_tokens_analyzed?: number;
  truncated?: boolean;
  extraction_confidence?: number;
}

/** Duck-typed WindowSummary. */
export interface WindowSummaryInput {
  size?: number;
  max_size?: number;
  verdicts?: {
    clear?: number;
    review_needed?: number;
    boundary_violation?: number;
  };
  integrity_ratio?: number;
  drift_alert_active?: boolean;
}

/** Duck-typed IntegrityCheckpoint. */
export interface CheckpointInput {
  checkpoint_id?: string;
  agent_id?: string;
  card_id?: string;
  session_id?: string;
  timestamp?: string;
  thinking_block_hash?: string;
  provider?: string;
  model?: string;
  verdict?: string;
  concerns?: ConcernInput[];
  reasoning_summary?: string;
  conscience_context?: ConscienceContextInput;
  window_position?: { index?: number; window_size?: number };
  analysis_metadata?: AnalysisMetadataInput;
  linked_trace_id?: string | null;
}

/** Duck-typed IntegritySignal (primary AIP input). */
export interface IntegritySignalInput {
  checkpoint: CheckpointInput;
  proceed?: boolean;
  recommended_action?: string;
  window_summary?: WindowSummaryInput;
}

// --- Duck-typed AAP inputs ---

/** Duck-typed Violation. */
export interface ViolationInput {
  type: string;
  severity: string;
  description: string;
  trace_field?: string | null;
}

/** Duck-typed Warning. */
export interface WarningInput {
  type: string;
  description: string;
  trace_field?: string | null;
}

/** Duck-typed VerificationMetadata. */
export interface VerificationMetadataInput {
  algorithm_version?: string;
  checks_performed?: string[];
  duration_ms?: number | null;
}

/** Duck-typed VerificationResult (primary AAP verification input). */
export interface VerificationResultInput {
  verified?: boolean;
  trace_id?: string;
  card_id?: string;
  timestamp?: string;
  violations?: ViolationInput[];
  warnings?: WarningInput[];
  verification_metadata?: VerificationMetadataInput;
  /** Python AAP has similarity_score on the result; TS does not. */
  similarity_score?: number;
}

/** Duck-typed ValueAlignment. */
export interface ValueAlignmentInput {
  matched?: string[];
  unmatched?: string[];
  conflicts?: Array<{
    initiator_value?: string;
    responder_value?: string;
    conflict_type?: string;
    description?: string;
  }>;
}

/** Duck-typed CoherenceResult. */
export interface CoherenceResultInput {
  compatible?: boolean;
  score?: number;
  value_alignment?: ValueAlignmentInput;
  proceed?: boolean;
  conditions?: string[];
}

/** Duck-typed DriftAnalysis. */
export interface DriftAnalysisInput {
  similarity_score?: number;
  sustained_traces?: number;
  threshold?: number;
  drift_direction?: string;
  specific_indicators?: Array<{
    indicator?: string;
    baseline?: number;
    current?: number;
    description?: string;
  }>;
}

/** Duck-typed DriftAlert (AAP). */
export interface DriftAlertInput {
  alert_type?: string;
  agent_id?: string;
  card_id?: string;
  detection_timestamp?: string;
  analysis?: DriftAnalysisInput;
  recommendation?: string;
  trace_ids?: string[];
}

/** Duck-typed IntegrityDriftAlert (AIP). */
export interface IntegrityDriftAlertInput {
  alert_id?: string;
  agent_id?: string;
  session_id?: string;
  checkpoint_ids?: string[];
  integrity_similarity?: number;
  sustained_checks?: number;
  severity?: string;
  drift_direction?: string;
  message?: string;
}

// --- Recorder interface ---

/** Public interface for the AIP OTel Recorder. */
export interface AIPOTelRecorder {
  /** Record an AIP integrity check as an OTel span. */
  recordIntegrityCheck(signal: IntegritySignalInput): void;
  /** Record an AAP verification result as an OTel span. */
  recordVerification(result: VerificationResultInput): void;
  /** Record an AAP coherence check as an OTel span. */
  recordCoherence(result: CoherenceResultInput): void;
  /** Record AAP drift detection as an OTel span. */
  recordDrift(alerts: DriftAlertInput[], tracesAnalyzed?: number): void;
}

/** Public interface for the CF Workers exporter. */
export interface WorkersOTelExporter {
  /** Record an AIP integrity check (builds internal span). */
  recordIntegrityCheck(signal: IntegritySignalInput): void;
  /** Record an AAP verification result (builds internal span). */
  recordVerification(result: VerificationResultInput): void;
  /** Record an AAP coherence check (builds internal span). */
  recordCoherence(result: CoherenceResultInput): void;
  /** Record AAP drift detection (builds internal span). */
  recordDrift(alerts: DriftAlertInput[], tracesAnalyzed?: number): void;
  /** Flush all buffered spans to the OTLP endpoint. Returns a Promise for ctx.waitUntil(). */
  flush(): Promise<void>;
}
