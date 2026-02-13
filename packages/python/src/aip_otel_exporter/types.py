"""
Duck-typed input types for the AIP OTel Exporter.

All input types use TypedDict with total=False so every field is optional.
This mirrors the TypeScript types where all fields use optional chaining
for graceful handling of missing data.
"""

from __future__ import annotations

from typing import List, Optional, TypedDict


# --- Duck-typed AIP inputs ---


class ConcernInput(TypedDict, total=False):
    """Duck-typed IntegrityConcern (matches AIP's IntegrityConcern shape)."""

    category: str
    severity: str
    description: str
    evidence: Optional[str]
    relevant_card_field: Optional[str]
    relevant_conscience_value: Optional[str]


class ConscienceContextInput(TypedDict, total=False):
    """Duck-typed ConscienceContext."""

    consultation_depth: str
    values_checked: List[str]
    conflicts: List[str]
    supports: List[str]
    considerations: List[str]


class AnalysisMetadataInput(TypedDict, total=False):
    """Duck-typed AnalysisMetadata."""

    analysis_model: str
    analysis_duration_ms: float
    thinking_tokens_original: int
    thinking_tokens_analyzed: int
    truncated: bool
    extraction_confidence: float


class WindowVerdicts(TypedDict, total=False):
    """Verdict counts within a window summary."""

    clear: int
    review_needed: int
    boundary_violation: int


class WindowSummaryInput(TypedDict, total=False):
    """Duck-typed WindowSummary."""

    size: int
    max_size: int
    verdicts: WindowVerdicts
    integrity_ratio: float
    drift_alert_active: bool


class WindowPosition(TypedDict, total=False):
    """Window position within a checkpoint."""

    index: int
    window_size: int


class CheckpointInput(TypedDict, total=False):
    """Duck-typed IntegrityCheckpoint."""

    checkpoint_id: str
    agent_id: str
    card_id: str
    session_id: str
    timestamp: str
    thinking_block_hash: str
    provider: str
    model: str
    verdict: str
    concerns: List[ConcernInput]
    reasoning_summary: str
    conscience_context: ConscienceContextInput
    window_position: WindowPosition
    analysis_metadata: AnalysisMetadataInput
    linked_trace_id: Optional[str]


class IntegritySignalInput(TypedDict, total=False):
    """Duck-typed IntegritySignal (primary AIP input)."""

    checkpoint: CheckpointInput
    proceed: bool
    recommended_action: str
    window_summary: WindowSummaryInput


# --- Duck-typed AAP inputs ---


class ViolationInput(TypedDict, total=False):
    """Duck-typed Violation."""

    type: str
    severity: str
    description: str
    trace_field: Optional[str]


class WarningInput(TypedDict, total=False):
    """Duck-typed Warning."""

    type: str
    description: str
    trace_field: Optional[str]


class VerificationMetadataInput(TypedDict, total=False):
    """Duck-typed VerificationMetadata."""

    algorithm_version: str
    checks_performed: List[str]
    duration_ms: Optional[float]


class VerificationResultInput(TypedDict, total=False):
    """Duck-typed VerificationResult (primary AAP verification input)."""

    verified: bool
    trace_id: str
    card_id: str
    timestamp: str
    violations: List[ViolationInput]
    warnings: List[WarningInput]
    verification_metadata: VerificationMetadataInput
    similarity_score: float


class ValueAlignmentConflict(TypedDict, total=False):
    """A single conflict in value alignment."""

    initiator_value: str
    responder_value: str
    conflict_type: str
    description: str


class ValueAlignmentInput(TypedDict, total=False):
    """Duck-typed ValueAlignment."""

    matched: List[str]
    unmatched: List[str]
    conflicts: List[ValueAlignmentConflict]


class CoherenceResultInput(TypedDict, total=False):
    """Duck-typed CoherenceResult."""

    compatible: bool
    score: float
    value_alignment: ValueAlignmentInput
    proceed: bool
    conditions: List[str]


class DriftIndicator(TypedDict, total=False):
    """A single specific indicator within drift analysis."""

    indicator: str
    baseline: float
    current: float
    description: str


class DriftAnalysisInput(TypedDict, total=False):
    """Duck-typed DriftAnalysis."""

    similarity_score: float
    sustained_traces: int
    threshold: float
    drift_direction: str
    specific_indicators: List[DriftIndicator]


class DriftAlertInput(TypedDict, total=False):
    """Duck-typed DriftAlert (AAP)."""

    alert_type: str
    agent_id: str
    card_id: str
    detection_timestamp: str
    analysis: DriftAnalysisInput
    recommendation: str
    trace_ids: List[str]


class IntegrityDriftAlertInput(TypedDict, total=False):
    """Duck-typed IntegrityDriftAlert (AIP)."""

    alert_id: str
    agent_id: str
    session_id: str
    checkpoint_ids: List[str]
    integrity_similarity: float
    sustained_checks: int
    severity: str
    drift_direction: str
    message: str
