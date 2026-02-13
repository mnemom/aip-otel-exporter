"""
Manual recording functions for AIP and AAP OpenTelemetry spans.

Four functions mirroring the TypeScript manual API:
- record_integrity_check  -- AIP integrity signal
- record_verification     -- AAP verification result
- record_coherence        -- AAP coherence check
- record_drift            -- AAP drift detection
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from opentelemetry import trace

from . import attributes as attr
from .span_builder import build_span


def record_integrity_check(
    tracer: trace.Tracer,
    signal: Dict[str, Any],
) -> trace.Span:
    """
    Record an AIP IntegritySignal as an OTel span.

    Maps all 22 domain attributes (plus 2 GenAI forward-compat aliases)
    from the checkpoint, signal, analysis_metadata, conscience_context, and
    window_summary onto a single INTERNAL span. Concerns are emitted as
    individual span events, and a drift alert event is added when the window
    summary indicates active drift.

    All inputs are duck-typed -- every field is accessed via ``.get()`` so
    missing data is silently skipped.
    """
    cp = (signal or {}).get("checkpoint") or {}
    meta = cp.get("analysis_metadata") or {}
    conscience = cp.get("conscience_context") or {}
    win = (signal or {}).get("window_summary") or {}
    concerns = cp.get("concerns")
    values_checked = conscience.get("values_checked")
    conflicts = conscience.get("conflicts")

    # --- Attributes (22 domain + 2 GenAI aliases) ---

    attributes: Dict[str, Any] = {
        # Checkpoint
        attr.AIP_INTEGRITY_CHECKPOINT_ID: cp.get("checkpoint_id"),
        attr.AIP_INTEGRITY_VERDICT: cp.get("verdict"),
        attr.AIP_INTEGRITY_AGENT_ID: cp.get("agent_id"),
        attr.AIP_INTEGRITY_CARD_ID: cp.get("card_id"),
        attr.AIP_INTEGRITY_SESSION_ID: cp.get("session_id"),
        attr.AIP_INTEGRITY_THINKING_HASH: cp.get("thinking_block_hash"),
        # Signal
        attr.AIP_INTEGRITY_PROCEED: (signal or {}).get("proceed"),
        attr.AIP_INTEGRITY_RECOMMENDED_ACTION: (signal or {}).get(
            "recommended_action"
        ),
        attr.AIP_INTEGRITY_CONCERNS_COUNT: (
            len(concerns) if concerns is not None else None
        ),
        # Analysis metadata
        attr.AIP_INTEGRITY_ANALYSIS_MODEL: meta.get("analysis_model"),
        attr.AIP_INTEGRITY_ANALYSIS_DURATION_MS: meta.get("analysis_duration_ms"),
        attr.AIP_INTEGRITY_THINKING_TOKENS: meta.get("thinking_tokens_original"),
        attr.AIP_INTEGRITY_TRUNCATED: meta.get("truncated"),
        attr.AIP_INTEGRITY_EXTRACTION_CONFIDENCE: meta.get("extraction_confidence"),
        # Conscience context
        attr.AIP_CONSCIENCE_CONSULTATION_DEPTH: conscience.get("consultation_depth"),
        attr.AIP_CONSCIENCE_VALUES_CHECKED_COUNT: (
            len(values_checked) if values_checked is not None else None
        ),
        attr.AIP_CONSCIENCE_CONFLICTS_COUNT: (
            len(conflicts) if conflicts is not None else None
        ),
        # Window summary
        attr.AIP_WINDOW_SIZE: win.get("size"),
        attr.AIP_WINDOW_INTEGRITY_RATIO: win.get("integrity_ratio"),
        attr.AIP_WINDOW_DRIFT_ALERT_ACTIVE: win.get("drift_alert_active"),
        # GenAI SIG forward-compat aliases
        attr.GEN_AI_EVALUATION_VERDICT: cp.get("verdict"),
        attr.GEN_AI_EVALUATION_SCORE: win.get("integrity_ratio"),
    }

    # --- Events ---

    events: List[Dict[str, Any]] = []

    # One event per concern
    if concerns:
        for concern in concerns:
            events.append(
                {
                    "name": attr.EVENT_AIP_CONCERN,
                    "attributes": {
                        "category": concern.get("category", ""),
                        "severity": concern.get("severity", ""),
                        "description": concern.get("description", ""),
                    },
                }
            )

    # Drift alert event when drift is active
    if win.get("drift_alert_active"):
        events.append(
            {
                "name": attr.EVENT_AIP_DRIFT_ALERT,
                "attributes": {},
            }
        )

    return build_span(tracer, attr.SPAN_AIP_INTEGRITY_CHECK, attributes, events)


def record_verification(
    tracer: trace.Tracer,
    result: Dict[str, Any],
) -> trace.Span:
    """
    Record an AAP VerificationResult as an OTel span.

    Maps 8 attributes (result, similarity_score, violations_count,
    warnings_count, trace_id, card_id, duration_ms, checks_performed) and
    emits one EVENT_AAP_VIOLATION event per violation.
    """
    result = result or {}
    meta = result.get("verification_metadata") or {}
    violations = result.get("violations")
    warnings = result.get("warnings")
    checks_performed = meta.get("checks_performed")

    attributes: Dict[str, Any] = {
        attr.AAP_VERIFICATION_RESULT: result.get("verified"),
        attr.AAP_VERIFICATION_SIMILARITY_SCORE: result.get("similarity_score"),
        attr.AAP_VERIFICATION_VIOLATIONS_COUNT: (
            len(violations) if violations is not None else None
        ),
        attr.AAP_VERIFICATION_WARNINGS_COUNT: (
            len(warnings) if warnings is not None else None
        ),
        attr.AAP_VERIFICATION_TRACE_ID: result.get("trace_id"),
        attr.AAP_VERIFICATION_CARD_ID: result.get("card_id"),
        attr.AAP_VERIFICATION_DURATION_MS: meta.get("duration_ms"),
        attr.AAP_VERIFICATION_CHECKS_PERFORMED: (
            ", ".join(checks_performed) if checks_performed else None
        ),
    }

    events: List[Dict[str, Any]] = []

    if violations:
        for violation in violations:
            events.append(
                {
                    "name": attr.EVENT_AAP_VIOLATION,
                    "attributes": {
                        "type": violation.get("type", ""),
                        "severity": violation.get("severity", ""),
                        "description": violation.get("description", ""),
                    },
                }
            )

    return build_span(tracer, attr.SPAN_AAP_VERIFY_TRACE, attributes, events)


def record_coherence(
    tracer: trace.Tracer,
    result: Dict[str, Any],
) -> trace.Span:
    """
    Record an AAP CoherenceResult as an OTel span.

    Maps 5 attributes: compatible, score, proceed, matched_count,
    conflict_count.
    """
    result = result or {}
    value_alignment = result.get("value_alignment") or {}
    matched = value_alignment.get("matched")
    conflicts = value_alignment.get("conflicts")

    attributes: Dict[str, Any] = {
        attr.AAP_COHERENCE_COMPATIBLE: result.get("compatible"),
        attr.AAP_COHERENCE_SCORE: result.get("score"),
        attr.AAP_COHERENCE_PROCEED: result.get("proceed"),
        attr.AAP_COHERENCE_MATCHED_COUNT: (
            len(matched) if matched is not None else None
        ),
        attr.AAP_COHERENCE_CONFLICT_COUNT: (
            len(conflicts) if conflicts is not None else None
        ),
    }

    return build_span(tracer, attr.SPAN_AAP_CHECK_COHERENCE, attributes)


def record_drift(
    tracer: trace.Tracer,
    alerts: List[Dict[str, Any]],
    traces_analyzed: int = 0,
) -> trace.Span:
    """
    Record AAP drift detection as an OTel span.

    Sets alerts_count and traces_analyzed as span attributes, then emits one
    EVENT_AAP_DRIFT_ALERT event per alert with type, agent, card, similarity,
    direction, and recommendation.
    """
    alerts = alerts or []

    attributes: Dict[str, Any] = {
        attr.AAP_DRIFT_ALERTS_COUNT: len(alerts) if alerts else 0,
        attr.AAP_DRIFT_TRACES_ANALYZED: traces_analyzed,
    }

    events: List[Dict[str, Any]] = []

    for alert in alerts:
        event_attrs: Dict[str, Any] = {}
        analysis = alert.get("analysis") or {}

        if alert.get("alert_type") is not None:
            event_attrs["alert_type"] = alert["alert_type"]
        if alert.get("agent_id") is not None:
            event_attrs["agent_id"] = alert["agent_id"]
        if alert.get("card_id") is not None:
            event_attrs["card_id"] = alert["card_id"]
        if analysis.get("similarity_score") is not None:
            event_attrs["similarity_score"] = analysis["similarity_score"]
        if analysis.get("drift_direction") is not None:
            event_attrs["drift_direction"] = analysis["drift_direction"]
        if alert.get("recommendation") is not None:
            event_attrs["recommendation"] = alert["recommendation"]

        events.append(
            {
                "name": attr.EVENT_AAP_DRIFT_ALERT,
                "attributes": event_attrs,
            }
        )

    return build_span(tracer, attr.SPAN_AAP_DETECT_DRIFT, attributes, events)
