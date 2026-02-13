"""
OpenTelemetry attribute name constants for AIP and AAP spans.

Primary namespace: aip.* and aap.* (vendor-specific).
Forward-compat aliases: gen_ai.evaluation.* for future OTel GenAI SIG alignment.
"""

# --- AIP Integrity Check Attributes ---

AIP_INTEGRITY_CHECKPOINT_ID = "aip.integrity.checkpoint_id"
AIP_INTEGRITY_VERDICT = "aip.integrity.verdict"
AIP_INTEGRITY_PROCEED = "aip.integrity.proceed"
AIP_INTEGRITY_RECOMMENDED_ACTION = "aip.integrity.recommended_action"
AIP_INTEGRITY_CONCERNS_COUNT = "aip.integrity.concerns_count"
AIP_INTEGRITY_AGENT_ID = "aip.integrity.agent_id"
AIP_INTEGRITY_CARD_ID = "aip.integrity.card_id"
AIP_INTEGRITY_SESSION_ID = "aip.integrity.session_id"
AIP_INTEGRITY_THINKING_HASH = "aip.integrity.thinking_hash"
AIP_INTEGRITY_ANALYSIS_MODEL = "aip.integrity.analysis_model"
AIP_INTEGRITY_ANALYSIS_DURATION_MS = "aip.integrity.analysis_duration_ms"
AIP_INTEGRITY_THINKING_TOKENS = "aip.integrity.thinking_tokens"
AIP_INTEGRITY_TRUNCATED = "aip.integrity.truncated"
AIP_INTEGRITY_EXTRACTION_CONFIDENCE = "aip.integrity.extraction_confidence"

# --- AIP Conscience Attributes ---

AIP_CONSCIENCE_CONSULTATION_DEPTH = "aip.conscience.consultation_depth"
AIP_CONSCIENCE_VALUES_CHECKED_COUNT = "aip.conscience.values_checked_count"
AIP_CONSCIENCE_CONFLICTS_COUNT = "aip.conscience.conflicts_count"

# --- AIP Window Attributes ---

AIP_WINDOW_SIZE = "aip.window.size"
AIP_WINDOW_INTEGRITY_RATIO = "aip.window.integrity_ratio"
AIP_WINDOW_DRIFT_ALERT_ACTIVE = "aip.window.drift_alert_active"

# --- GenAI SIG Forward-Compat Aliases ---

GEN_AI_EVALUATION_VERDICT = "gen_ai.evaluation.verdict"
GEN_AI_EVALUATION_SCORE = "gen_ai.evaluation.score"

# --- AAP Verification Attributes ---

AAP_VERIFICATION_RESULT = "aap.verification.result"
AAP_VERIFICATION_SIMILARITY_SCORE = "aap.verification.similarity_score"
AAP_VERIFICATION_VIOLATIONS_COUNT = "aap.verification.violations_count"
AAP_VERIFICATION_WARNINGS_COUNT = "aap.verification.warnings_count"
AAP_VERIFICATION_TRACE_ID = "aap.verification.trace_id"
AAP_VERIFICATION_CARD_ID = "aap.verification.card_id"
AAP_VERIFICATION_DURATION_MS = "aap.verification.duration_ms"
AAP_VERIFICATION_CHECKS_PERFORMED = "aap.verification.checks_performed"

# --- AAP Coherence Attributes ---

AAP_COHERENCE_COMPATIBLE = "aap.coherence.compatible"
AAP_COHERENCE_SCORE = "aap.coherence.score"
AAP_COHERENCE_PROCEED = "aap.coherence.proceed"
AAP_COHERENCE_MATCHED_COUNT = "aap.coherence.matched_count"
AAP_COHERENCE_CONFLICT_COUNT = "aap.coherence.conflict_count"

# --- AAP Drift Detection Attributes ---

AAP_DRIFT_ALERTS_COUNT = "aap.drift.alerts_count"
AAP_DRIFT_TRACES_ANALYZED = "aap.drift.traces_analyzed"

# --- AIP Drift Alert Attributes (for events) ---

AIP_DRIFT_ALERT_ID = "aip.drift.alert_id"
AIP_DRIFT_AGENT_ID = "aip.drift.agent_id"
AIP_DRIFT_SESSION_ID = "aip.drift.session_id"
AIP_DRIFT_INTEGRITY_SIMILARITY = "aip.drift.integrity_similarity"
AIP_DRIFT_SUSTAINED_CHECKS = "aip.drift.sustained_checks"
AIP_DRIFT_SEVERITY = "aip.drift.severity"
AIP_DRIFT_DIRECTION = "aip.drift.drift_direction"
AIP_DRIFT_MESSAGE = "aip.drift.message"

# --- Span Names ---

SPAN_AIP_INTEGRITY_CHECK = "aip.integrity_check"
SPAN_AAP_VERIFY_TRACE = "aap.verify_trace"
SPAN_AAP_CHECK_COHERENCE = "aap.check_coherence"
SPAN_AAP_DETECT_DRIFT = "aap.detect_drift"

# --- Event Names ---

EVENT_AIP_CONCERN = "aip.concern"
EVENT_AIP_DRIFT_ALERT = "aip.drift_alert"
EVENT_AAP_VIOLATION = "aap.violation"
EVENT_AAP_DRIFT_ALERT = "aap.drift_alert"

# --- Metric Names ---

METRIC_AIP_INTEGRITY_CHECKS_TOTAL = "aip.integrity_checks.total"
METRIC_AIP_INTEGRITY_CHECKS_BY_VERDICT = "aip.integrity_checks.by_verdict"
METRIC_AIP_CONCERNS_TOTAL = "aip.concerns.total"
METRIC_AIP_ANALYSIS_DURATION = "aip.analysis.duration_ms"
METRIC_AIP_WINDOW_INTEGRITY_RATIO = "aip.window.integrity_ratio"
METRIC_AIP_DRIFT_ALERTS_TOTAL = "aip.drift_alerts.total"
METRIC_AAP_VERIFICATIONS_TOTAL = "aap.verifications.total"
METRIC_AAP_VIOLATIONS_TOTAL = "aap.violations.total"
METRIC_AAP_VERIFICATION_DURATION = "aap.verification.duration_ms"
METRIC_AAP_COHERENCE_SCORE = "aap.coherence.score"
