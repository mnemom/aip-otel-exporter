"""No free text in exported telemetry.

The typed recorders export identifiers and operational data only (ids,
verdicts, enums, severities, categories, counts, durations, model names).
Free text that can quote or paraphrase customer content must never reach the
trace backend. Every free-text field the input shapes allow carries a sentinel
here, and each test checks the recorded span for it.
"""

import json

import pytest

from aip_otel_exporter import (
    record_coherence,
    record_drift,
    record_integrity_check,
    record_verification,
)
from aip_otel_exporter.span_builder import scalar_attributes

FREE = "FREE-TEXT-SENTINEL"


def free(field: str) -> str:
    return f"{FREE} {field}: the agent said the customer's card number is 4111"


SIGNAL = {
    "checkpoint": {
        "checkpoint_id": "ic-1",
        "agent_id": "agent-1",
        "card_id": "card-1",
        "verdict": "review_needed",
        "reasoning_summary": free("reasoning_summary"),
        "concerns": [
            {
                "category": "value_misalignment",
                "severity": "medium",
                "description": free("concern.description"),
                "evidence": free("concern.evidence"),
                "relevant_card_field": free("concern.relevant_card_field"),
                "future_field": free("concern.future_field"),
            }
        ],
        "conscience_context": {
            "consultation_depth": "standard",
            "values_checked": [free("values_checked")],
            "conflicts": [free("conflicts")],
        },
    },
    "proceed": False,
    "recommended_action": "pause_for_review",
    "window_summary": {"size": 3, "integrity_ratio": 0.5, "drift_alert_active": True},
}

VERIFICATION = {
    "verified": False,
    "trace_id": "tr-1",
    "card_id": "card-1",
    "violations": [
        {
            "type": "forbidden_action",
            "severity": "critical",
            "description": free("violation.description"),
            "trace_field": free("violation.trace_field"),
        }
    ],
    "warnings": [{"type": "style", "description": free("warning.description")}],
    "verification_metadata": {"duration_ms": 7, "checks_performed": ["autonomy"]},
}

COHERENCE = {
    "compatible": False,
    "score": 0.4,
    "proceed": False,
    "conditions": [free("conditions")],
    "value_alignment": {
        "matched": ["honesty"],
        "conflicts": [{"conflict_type": "priority", "description": free("conflict.description")}],
    },
}

DRIFT = [
    {
        "alert_type": "behavioral_drift",
        "agent_id": "agent-1",
        "card_id": "card-1",
        "analysis": {
            "similarity_score": 0.6,
            "drift_direction": "permissive",
            "specific_indicators": [
                {"indicator": "refusal_rate", "description": free("indicator.description")}
            ],
        },
        "recommendation": free("drift.recommendation"),
    }
]

EVENT_KEYS = {
    "aip.concern": ["category", "severity"],
    "aip.drift_alert": [],
    "aap.violation": ["severity", "type"],
    "aap.drift_alert": ["agent_id", "alert_type", "card_id", "drift_direction", "similarity_score"],
}


def _dump(span) -> str:
    return json.dumps(
        {
            "attributes": dict(span.attributes),
            "events": [{"name": e.name, "attributes": dict(e.attributes)} for e in span.events],
        },
        default=str,
    )


@pytest.mark.parametrize(
    "record",
    [
        lambda t: record_integrity_check(t, SIGNAL),
        lambda t: record_verification(t, VERIFICATION),
        lambda t: record_coherence(t, COHERENCE),
        lambda t: record_drift(t, DRIFT, traces_analyzed=10),
    ],
    ids=["record_integrity_check", "record_verification", "record_coherence", "record_drift"],
)
def test_recorder_exports_no_free_text(tracer_and_exporter, record):
    tracer, exporter = tracer_and_exporter
    record(tracer)
    (span,) = exporter.get_finished_spans()

    assert FREE not in _dump(span)
    for event in span.events:
        assert sorted(event.attributes) == EVENT_KEYS[event.name]


def test_named_field_with_non_scalar_value_is_dropped(tracer_and_exporter):
    tracer, exporter = tracer_and_exporter
    record_integrity_check(
        tracer,
        {
            **SIGNAL,
            "recommended_action": [free("list")],
            "checkpoint": {
                **SIGNAL["checkpoint"],
                "verdict": {"text": free("dict")},
                "concerns": [{"category": [free("nested")], "severity": "low"}],
            },
        },
    )
    (span,) = exporter.get_finished_spans()

    assert FREE not in _dump(span)
    assert "aip.integrity.verdict" not in span.attributes
    assert "aip.integrity.recommended_action" not in span.attributes
    assert dict(span.events[0].attributes) == {"severity": "low"}


def test_scalar_attributes_keeps_only_scalars():
    assert scalar_attributes(
        {
            "s": "x",
            "i": 0,
            "f": 1.5,
            "b": False,
            "n": None,
            "d": {"a": 1},
            "l": ["x"],
            "e": ValueError("boom"),
        }
    ) == {"s": "x", "i": 0, "f": 1.5, "b": False}
