"""Tests for manual recording functions."""

from opentelemetry.trace import StatusCode

from aip_otel_exporter import attributes as attr
from aip_otel_exporter import (
    record_coherence,
    record_drift,
    record_integrity_check,
    record_verification,
)

# ---------------------------------------------------------------------------
# Fixtures (test data)
# ---------------------------------------------------------------------------

SIGNAL_FIXTURE = {
    "checkpoint": {
        "checkpoint_id": "ic-test-123",
        "agent_id": "agent-1",
        "card_id": "card-1",
        "session_id": "session-1",
        "verdict": "review_needed",
        "thinking_block_hash": "sha256-abc",
        "concerns": [
            {"category": "value_misalignment", "severity": "medium", "description": "Minor concern"},
            {"category": "autonomy_violation", "severity": "high", "description": "Major concern"},
        ],
        "conscience_context": {
            "consultation_depth": "standard",
            "values_checked": ["v1", "v2", "v3"],
            "conflicts": ["c1"],
        },
        "analysis_metadata": {
            "analysis_model": "claude-3-haiku",
            "analysis_duration_ms": 450.5,
            "thinking_tokens_original": 1200,
            "truncated": False,
            "extraction_confidence": 0.95,
        },
    },
    "proceed": True,
    "recommended_action": "log_and_continue",
    "window_summary": {
        "size": 5,
        "integrity_ratio": 0.8,
        "drift_alert_active": False,
    },
}


VERIFICATION_FIXTURE = {
    "verified": False,
    "trace_id": "trace-123",
    "card_id": "card-1",
    "violations": [
        {"type": "forbidden_action", "severity": "critical", "description": "Attempted forbidden action"},
    ],
    "warnings": [{"type": "style", "description": "Style warning"}],
    "verification_metadata": {
        "duration_ms": 120,
        "checks_performed": ["action_bounds", "value_alignment"],
    },
    "similarity_score": 0.75,
}


COHERENCE_FIXTURE = {
    "compatible": True,
    "score": 0.9,
    "proceed": True,
    "value_alignment": {
        "matched": ["a", "b"],
        "conflicts": [],
    },
}


DRIFT_ALERTS_FIXTURE = [
    {
        "alert_type": "drift_detected",
        "agent_id": "agent-1",
        "card_id": "card-1",
        "analysis": {
            "similarity_score": 0.3,
            "drift_direction": "value_drift",
        },
        "recommendation": "review",
    },
]


# ===========================================================================
# record_integrity_check
# ===========================================================================


class TestRecordIntegrityCheck:
    def test_span_name(self, tracer_and_exporter):
        tracer, exporter = tracer_and_exporter
        record_integrity_check(tracer, SIGNAL_FIXTURE)
        spans = exporter.get_finished_spans()
        assert len(spans) == 1
        assert spans[0].name == "aip.integrity_check"

    def test_span_status_ok(self, tracer_and_exporter):
        tracer, exporter = tracer_and_exporter
        record_integrity_check(tracer, SIGNAL_FIXTURE)
        span = exporter.get_finished_spans()[0]
        assert span.status.status_code == StatusCode.OK

    # -- Checkpoint attributes --

    def test_checkpoint_id(self, tracer_and_exporter):
        tracer, exporter = tracer_and_exporter
        record_integrity_check(tracer, SIGNAL_FIXTURE)
        attrs = dict(exporter.get_finished_spans()[0].attributes)
        assert attrs[attr.AIP_INTEGRITY_CHECKPOINT_ID] == "ic-test-123"

    def test_verdict(self, tracer_and_exporter):
        tracer, exporter = tracer_and_exporter
        record_integrity_check(tracer, SIGNAL_FIXTURE)
        attrs = dict(exporter.get_finished_spans()[0].attributes)
        assert attrs[attr.AIP_INTEGRITY_VERDICT] == "review_needed"

    def test_agent_id(self, tracer_and_exporter):
        tracer, exporter = tracer_and_exporter
        record_integrity_check(tracer, SIGNAL_FIXTURE)
        attrs = dict(exporter.get_finished_spans()[0].attributes)
        assert attrs[attr.AIP_INTEGRITY_AGENT_ID] == "agent-1"

    def test_card_id(self, tracer_and_exporter):
        tracer, exporter = tracer_and_exporter
        record_integrity_check(tracer, SIGNAL_FIXTURE)
        attrs = dict(exporter.get_finished_spans()[0].attributes)
        assert attrs[attr.AIP_INTEGRITY_CARD_ID] == "card-1"

    def test_session_id(self, tracer_and_exporter):
        tracer, exporter = tracer_and_exporter
        record_integrity_check(tracer, SIGNAL_FIXTURE)
        attrs = dict(exporter.get_finished_spans()[0].attributes)
        assert attrs[attr.AIP_INTEGRITY_SESSION_ID] == "session-1"

    def test_thinking_hash(self, tracer_and_exporter):
        tracer, exporter = tracer_and_exporter
        record_integrity_check(tracer, SIGNAL_FIXTURE)
        attrs = dict(exporter.get_finished_spans()[0].attributes)
        assert attrs[attr.AIP_INTEGRITY_THINKING_HASH] == "sha256-abc"

    # -- Signal-level attributes --

    def test_proceed(self, tracer_and_exporter):
        tracer, exporter = tracer_and_exporter
        record_integrity_check(tracer, SIGNAL_FIXTURE)
        attrs = dict(exporter.get_finished_spans()[0].attributes)
        assert attrs[attr.AIP_INTEGRITY_PROCEED] is True

    def test_recommended_action(self, tracer_and_exporter):
        tracer, exporter = tracer_and_exporter
        record_integrity_check(tracer, SIGNAL_FIXTURE)
        attrs = dict(exporter.get_finished_spans()[0].attributes)
        assert attrs[attr.AIP_INTEGRITY_RECOMMENDED_ACTION] == "log_and_continue"

    def test_concerns_count(self, tracer_and_exporter):
        tracer, exporter = tracer_and_exporter
        record_integrity_check(tracer, SIGNAL_FIXTURE)
        attrs = dict(exporter.get_finished_spans()[0].attributes)
        assert attrs[attr.AIP_INTEGRITY_CONCERNS_COUNT] == 2

    # -- Analysis metadata attributes --

    def test_analysis_model(self, tracer_and_exporter):
        tracer, exporter = tracer_and_exporter
        record_integrity_check(tracer, SIGNAL_FIXTURE)
        attrs = dict(exporter.get_finished_spans()[0].attributes)
        assert attrs[attr.AIP_INTEGRITY_ANALYSIS_MODEL] == "claude-3-haiku"

    def test_analysis_duration_ms(self, tracer_and_exporter):
        tracer, exporter = tracer_and_exporter
        record_integrity_check(tracer, SIGNAL_FIXTURE)
        attrs = dict(exporter.get_finished_spans()[0].attributes)
        assert attrs[attr.AIP_INTEGRITY_ANALYSIS_DURATION_MS] == 450.5

    def test_thinking_tokens(self, tracer_and_exporter):
        tracer, exporter = tracer_and_exporter
        record_integrity_check(tracer, SIGNAL_FIXTURE)
        attrs = dict(exporter.get_finished_spans()[0].attributes)
        assert attrs[attr.AIP_INTEGRITY_THINKING_TOKENS] == 1200

    def test_truncated(self, tracer_and_exporter):
        tracer, exporter = tracer_and_exporter
        record_integrity_check(tracer, SIGNAL_FIXTURE)
        attrs = dict(exporter.get_finished_spans()[0].attributes)
        assert attrs[attr.AIP_INTEGRITY_TRUNCATED] is False

    def test_extraction_confidence(self, tracer_and_exporter):
        tracer, exporter = tracer_and_exporter
        record_integrity_check(tracer, SIGNAL_FIXTURE)
        attrs = dict(exporter.get_finished_spans()[0].attributes)
        assert attrs[attr.AIP_INTEGRITY_EXTRACTION_CONFIDENCE] == 0.95

    # -- Conscience context attributes --

    def test_consultation_depth(self, tracer_and_exporter):
        tracer, exporter = tracer_and_exporter
        record_integrity_check(tracer, SIGNAL_FIXTURE)
        attrs = dict(exporter.get_finished_spans()[0].attributes)
        assert attrs[attr.AIP_CONSCIENCE_CONSULTATION_DEPTH] == "standard"

    def test_values_checked_count(self, tracer_and_exporter):
        tracer, exporter = tracer_and_exporter
        record_integrity_check(tracer, SIGNAL_FIXTURE)
        attrs = dict(exporter.get_finished_spans()[0].attributes)
        assert attrs[attr.AIP_CONSCIENCE_VALUES_CHECKED_COUNT] == 3

    def test_conflicts_count(self, tracer_and_exporter):
        tracer, exporter = tracer_and_exporter
        record_integrity_check(tracer, SIGNAL_FIXTURE)
        attrs = dict(exporter.get_finished_spans()[0].attributes)
        assert attrs[attr.AIP_CONSCIENCE_CONFLICTS_COUNT] == 1

    # -- Window summary attributes --

    def test_window_size(self, tracer_and_exporter):
        tracer, exporter = tracer_and_exporter
        record_integrity_check(tracer, SIGNAL_FIXTURE)
        attrs = dict(exporter.get_finished_spans()[0].attributes)
        assert attrs[attr.AIP_WINDOW_SIZE] == 5

    def test_window_integrity_ratio(self, tracer_and_exporter):
        tracer, exporter = tracer_and_exporter
        record_integrity_check(tracer, SIGNAL_FIXTURE)
        attrs = dict(exporter.get_finished_spans()[0].attributes)
        assert attrs[attr.AIP_WINDOW_INTEGRITY_RATIO] == 0.8

    def test_window_drift_alert_active_false(self, tracer_and_exporter):
        tracer, exporter = tracer_and_exporter
        record_integrity_check(tracer, SIGNAL_FIXTURE)
        attrs = dict(exporter.get_finished_spans()[0].attributes)
        assert attrs[attr.AIP_WINDOW_DRIFT_ALERT_ACTIVE] is False

    # -- GenAI SIG forward-compat aliases --

    def test_gen_ai_verdict(self, tracer_and_exporter):
        tracer, exporter = tracer_and_exporter
        record_integrity_check(tracer, SIGNAL_FIXTURE)
        attrs = dict(exporter.get_finished_spans()[0].attributes)
        assert attrs[attr.GEN_AI_EVALUATION_VERDICT] == "review_needed"

    def test_gen_ai_score(self, tracer_and_exporter):
        tracer, exporter = tracer_and_exporter
        record_integrity_check(tracer, SIGNAL_FIXTURE)
        attrs = dict(exporter.get_finished_spans()[0].attributes)
        assert attrs[attr.GEN_AI_EVALUATION_SCORE] == 0.8

    # -- Concern events --

    def test_concern_events_count(self, tracer_and_exporter):
        tracer, exporter = tracer_and_exporter
        record_integrity_check(tracer, SIGNAL_FIXTURE)
        span = exporter.get_finished_spans()[0]
        concern_events = [e for e in span.events if e.name == "aip.concern"]
        assert len(concern_events) == 2

    def test_concern_event_attributes(self, tracer_and_exporter):
        tracer, exporter = tracer_and_exporter
        record_integrity_check(tracer, SIGNAL_FIXTURE)
        span = exporter.get_finished_spans()[0]
        concern_events = [e for e in span.events if e.name == "aip.concern"]
        assert concern_events[0].attributes["category"] == "value_misalignment"
        assert concern_events[0].attributes["severity"] == "medium"
        assert concern_events[0].attributes["description"] == "Minor concern"
        assert concern_events[1].attributes["category"] == "autonomy_violation"
        assert concern_events[1].attributes["severity"] == "high"

    def test_no_drift_event_when_inactive(self, tracer_and_exporter):
        tracer, exporter = tracer_and_exporter
        record_integrity_check(tracer, SIGNAL_FIXTURE)
        span = exporter.get_finished_spans()[0]
        drift_events = [e for e in span.events if e.name == "aip.drift_alert"]
        assert len(drift_events) == 0

    def test_drift_alert_event_when_active(self, tracer_and_exporter):
        tracer, exporter = tracer_and_exporter
        signal = {
            **SIGNAL_FIXTURE,
            "window_summary": {**SIGNAL_FIXTURE["window_summary"], "drift_alert_active": True},
        }
        record_integrity_check(tracer, signal)
        span = exporter.get_finished_spans()[0]
        drift_events = [e for e in span.events if e.name == "aip.drift_alert"]
        assert len(drift_events) == 1

    # -- Minimal / edge-case inputs --

    def test_minimal_signal(self, tracer_and_exporter):
        tracer, exporter = tracer_and_exporter
        record_integrity_check(tracer, {"checkpoint": {"verdict": "clear"}})
        spans = exporter.get_finished_spans()
        assert len(spans) == 1
        attrs = dict(spans[0].attributes)
        assert attrs[attr.AIP_INTEGRITY_VERDICT] == "clear"

    def test_empty_signal(self, tracer_and_exporter):
        tracer, exporter = tracer_and_exporter
        record_integrity_check(tracer, {})
        spans = exporter.get_finished_spans()
        assert len(spans) == 1

    def test_none_concerns_omits_count(self, tracer_and_exporter):
        """When concerns is not present, concerns_count should not be set."""
        tracer, exporter = tracer_and_exporter
        record_integrity_check(tracer, {"checkpoint": {"verdict": "clear"}})
        attrs = dict(exporter.get_finished_spans()[0].attributes)
        assert attr.AIP_INTEGRITY_CONCERNS_COUNT not in attrs

    def test_empty_concerns_list(self, tracer_and_exporter):
        tracer, exporter = tracer_and_exporter
        signal = {"checkpoint": {"verdict": "clear", "concerns": []}}
        record_integrity_check(tracer, signal)
        attrs = dict(exporter.get_finished_spans()[0].attributes)
        assert attrs[attr.AIP_INTEGRITY_CONCERNS_COUNT] == 0
        span = exporter.get_finished_spans()[0]
        concern_events = [e for e in span.events if e.name == "aip.concern"]
        assert len(concern_events) == 0


# ===========================================================================
# record_verification
# ===========================================================================


class TestRecordVerification:
    def test_span_name(self, tracer_and_exporter):
        tracer, exporter = tracer_and_exporter
        record_verification(tracer, VERIFICATION_FIXTURE)
        spans = exporter.get_finished_spans()
        assert len(spans) == 1
        assert spans[0].name == "aap.verify_trace"

    def test_span_status_ok(self, tracer_and_exporter):
        tracer, exporter = tracer_and_exporter
        record_verification(tracer, VERIFICATION_FIXTURE)
        span = exporter.get_finished_spans()[0]
        assert span.status.status_code == StatusCode.OK

    def test_verified_result(self, tracer_and_exporter):
        tracer, exporter = tracer_and_exporter
        record_verification(tracer, VERIFICATION_FIXTURE)
        attrs = dict(exporter.get_finished_spans()[0].attributes)
        assert attrs[attr.AAP_VERIFICATION_RESULT] is False

    def test_similarity_score(self, tracer_and_exporter):
        tracer, exporter = tracer_and_exporter
        record_verification(tracer, VERIFICATION_FIXTURE)
        attrs = dict(exporter.get_finished_spans()[0].attributes)
        assert attrs[attr.AAP_VERIFICATION_SIMILARITY_SCORE] == 0.75

    def test_violations_count(self, tracer_and_exporter):
        tracer, exporter = tracer_and_exporter
        record_verification(tracer, VERIFICATION_FIXTURE)
        attrs = dict(exporter.get_finished_spans()[0].attributes)
        assert attrs[attr.AAP_VERIFICATION_VIOLATIONS_COUNT] == 1

    def test_warnings_count(self, tracer_and_exporter):
        tracer, exporter = tracer_and_exporter
        record_verification(tracer, VERIFICATION_FIXTURE)
        attrs = dict(exporter.get_finished_spans()[0].attributes)
        assert attrs[attr.AAP_VERIFICATION_WARNINGS_COUNT] == 1

    def test_trace_id(self, tracer_and_exporter):
        tracer, exporter = tracer_and_exporter
        record_verification(tracer, VERIFICATION_FIXTURE)
        attrs = dict(exporter.get_finished_spans()[0].attributes)
        assert attrs[attr.AAP_VERIFICATION_TRACE_ID] == "trace-123"

    def test_card_id(self, tracer_and_exporter):
        tracer, exporter = tracer_and_exporter
        record_verification(tracer, VERIFICATION_FIXTURE)
        attrs = dict(exporter.get_finished_spans()[0].attributes)
        assert attrs[attr.AAP_VERIFICATION_CARD_ID] == "card-1"

    def test_duration_ms(self, tracer_and_exporter):
        tracer, exporter = tracer_and_exporter
        record_verification(tracer, VERIFICATION_FIXTURE)
        attrs = dict(exporter.get_finished_spans()[0].attributes)
        assert attrs[attr.AAP_VERIFICATION_DURATION_MS] == 120

    def test_checks_performed(self, tracer_and_exporter):
        tracer, exporter = tracer_and_exporter
        record_verification(tracer, VERIFICATION_FIXTURE)
        attrs = dict(exporter.get_finished_spans()[0].attributes)
        assert attrs[attr.AAP_VERIFICATION_CHECKS_PERFORMED] == "action_bounds, value_alignment"

    def test_violation_events(self, tracer_and_exporter):
        tracer, exporter = tracer_and_exporter
        record_verification(tracer, VERIFICATION_FIXTURE)
        span = exporter.get_finished_spans()[0]
        violations = [e for e in span.events if e.name == "aap.violation"]
        assert len(violations) == 1
        assert violations[0].attributes["type"] == "forbidden_action"
        assert violations[0].attributes["severity"] == "critical"
        assert violations[0].attributes["description"] == "Attempted forbidden action"

    def test_minimal_verification(self, tracer_and_exporter):
        tracer, exporter = tracer_and_exporter
        record_verification(tracer, {"verified": True})
        spans = exporter.get_finished_spans()
        assert len(spans) == 1
        attrs = dict(spans[0].attributes)
        assert attrs[attr.AAP_VERIFICATION_RESULT] is True

    def test_empty_verification(self, tracer_and_exporter):
        tracer, exporter = tracer_and_exporter
        record_verification(tracer, {})
        spans = exporter.get_finished_spans()
        assert len(spans) == 1

    def test_no_violations_no_events(self, tracer_and_exporter):
        tracer, exporter = tracer_and_exporter
        record_verification(tracer, {"verified": True, "violations": []})
        span = exporter.get_finished_spans()[0]
        violations = [e for e in span.events if e.name == "aap.violation"]
        assert len(violations) == 0


# ===========================================================================
# record_coherence
# ===========================================================================


class TestRecordCoherence:
    def test_span_name(self, tracer_and_exporter):
        tracer, exporter = tracer_and_exporter
        record_coherence(tracer, COHERENCE_FIXTURE)
        span = exporter.get_finished_spans()[0]
        assert span.name == "aap.check_coherence"

    def test_compatible(self, tracer_and_exporter):
        tracer, exporter = tracer_and_exporter
        record_coherence(tracer, COHERENCE_FIXTURE)
        attrs = dict(exporter.get_finished_spans()[0].attributes)
        assert attrs[attr.AAP_COHERENCE_COMPATIBLE] is True

    def test_score(self, tracer_and_exporter):
        tracer, exporter = tracer_and_exporter
        record_coherence(tracer, COHERENCE_FIXTURE)
        attrs = dict(exporter.get_finished_spans()[0].attributes)
        assert attrs[attr.AAP_COHERENCE_SCORE] == 0.9

    def test_proceed(self, tracer_and_exporter):
        tracer, exporter = tracer_and_exporter
        record_coherence(tracer, COHERENCE_FIXTURE)
        attrs = dict(exporter.get_finished_spans()[0].attributes)
        assert attrs[attr.AAP_COHERENCE_PROCEED] is True

    def test_matched_count(self, tracer_and_exporter):
        tracer, exporter = tracer_and_exporter
        record_coherence(tracer, COHERENCE_FIXTURE)
        attrs = dict(exporter.get_finished_spans()[0].attributes)
        assert attrs[attr.AAP_COHERENCE_MATCHED_COUNT] == 2

    def test_conflict_count_zero(self, tracer_and_exporter):
        tracer, exporter = tracer_and_exporter
        record_coherence(tracer, COHERENCE_FIXTURE)
        attrs = dict(exporter.get_finished_spans()[0].attributes)
        assert attrs[attr.AAP_COHERENCE_CONFLICT_COUNT] == 0

    def test_conflict_count_nonzero(self, tracer_and_exporter):
        tracer, exporter = tracer_and_exporter
        result = {
            **COHERENCE_FIXTURE,
            "value_alignment": {
                "matched": [],
                "conflicts": [
                    {"initiator_value": "a", "responder_value": "b", "conflict_type": "hard"},
                ],
            },
        }
        record_coherence(tracer, result)
        attrs = dict(exporter.get_finished_spans()[0].attributes)
        assert attrs[attr.AAP_COHERENCE_CONFLICT_COUNT] == 1
        assert attrs[attr.AAP_COHERENCE_MATCHED_COUNT] == 0

    def test_no_events(self, tracer_and_exporter):
        """Coherence spans should have no events."""
        tracer, exporter = tracer_and_exporter
        record_coherence(tracer, COHERENCE_FIXTURE)
        span = exporter.get_finished_spans()[0]
        assert len(span.events) == 0

    def test_minimal_coherence(self, tracer_and_exporter):
        tracer, exporter = tracer_and_exporter
        record_coherence(tracer, {"compatible": False, "score": 0.1})
        spans = exporter.get_finished_spans()
        assert len(spans) == 1
        attrs = dict(spans[0].attributes)
        assert attrs[attr.AAP_COHERENCE_COMPATIBLE] is False
        assert attrs[attr.AAP_COHERENCE_SCORE] == 0.1

    def test_empty_coherence(self, tracer_and_exporter):
        tracer, exporter = tracer_and_exporter
        record_coherence(tracer, {})
        spans = exporter.get_finished_spans()
        assert len(spans) == 1


# ===========================================================================
# record_drift
# ===========================================================================


class TestRecordDrift:
    def test_span_name(self, tracer_and_exporter):
        tracer, exporter = tracer_and_exporter
        record_drift(tracer, DRIFT_ALERTS_FIXTURE, traces_analyzed=10)
        span = exporter.get_finished_spans()[0]
        assert span.name == "aap.detect_drift"

    def test_alerts_count(self, tracer_and_exporter):
        tracer, exporter = tracer_and_exporter
        record_drift(tracer, DRIFT_ALERTS_FIXTURE, traces_analyzed=10)
        attrs = dict(exporter.get_finished_spans()[0].attributes)
        assert attrs[attr.AAP_DRIFT_ALERTS_COUNT] == 1

    def test_traces_analyzed(self, tracer_and_exporter):
        tracer, exporter = tracer_and_exporter
        record_drift(tracer, DRIFT_ALERTS_FIXTURE, traces_analyzed=10)
        attrs = dict(exporter.get_finished_spans()[0].attributes)
        assert attrs[attr.AAP_DRIFT_TRACES_ANALYZED] == 10

    def test_drift_alert_events(self, tracer_and_exporter):
        tracer, exporter = tracer_and_exporter
        record_drift(tracer, DRIFT_ALERTS_FIXTURE, traces_analyzed=10)
        span = exporter.get_finished_spans()[0]
        drift_events = [e for e in span.events if e.name == "aap.drift_alert"]
        assert len(drift_events) == 1
        event_attrs = dict(drift_events[0].attributes)
        assert event_attrs["alert_type"] == "drift_detected"
        assert event_attrs["agent_id"] == "agent-1"
        assert event_attrs["card_id"] == "card-1"
        assert event_attrs["similarity_score"] == 0.3
        assert event_attrs["drift_direction"] == "value_drift"
        assert event_attrs["recommendation"] == "review"

    def test_multiple_alerts(self, tracer_and_exporter):
        tracer, exporter = tracer_and_exporter
        alerts = [
            {
                "alert_type": "drift_detected",
                "agent_id": "agent-1",
                "analysis": {"similarity_score": 0.3},
            },
            {
                "alert_type": "drift_confirmed",
                "agent_id": "agent-2",
                "analysis": {"similarity_score": 0.1},
            },
        ]
        record_drift(tracer, alerts, traces_analyzed=20)
        span = exporter.get_finished_spans()[0]
        attrs = dict(span.attributes)
        assert attrs[attr.AAP_DRIFT_ALERTS_COUNT] == 2
        drift_events = [e for e in span.events if e.name == "aap.drift_alert"]
        assert len(drift_events) == 2

    def test_empty_alerts(self, tracer_and_exporter):
        tracer, exporter = tracer_and_exporter
        record_drift(tracer, [], traces_analyzed=5)
        spans = exporter.get_finished_spans()
        assert len(spans) == 1
        attrs = dict(spans[0].attributes)
        assert attrs[attr.AAP_DRIFT_ALERTS_COUNT] == 0
        assert attrs[attr.AAP_DRIFT_TRACES_ANALYZED] == 5
        span = spans[0]
        assert len(span.events) == 0

    def test_default_traces_analyzed(self, tracer_and_exporter):
        tracer, exporter = tracer_and_exporter
        record_drift(tracer, [])
        attrs = dict(exporter.get_finished_spans()[0].attributes)
        assert attrs[attr.AAP_DRIFT_TRACES_ANALYZED] == 0

    def test_alert_with_missing_analysis(self, tracer_and_exporter):
        """Alerts without analysis should still produce events gracefully."""
        tracer, exporter = tracer_and_exporter
        alerts = [{"alert_type": "drift_detected"}]
        record_drift(tracer, alerts)
        span = exporter.get_finished_spans()[0]
        drift_events = [e for e in span.events if e.name == "aap.drift_alert"]
        assert len(drift_events) == 1
        event_attrs = dict(drift_events[0].attributes)
        assert event_attrs["alert_type"] == "drift_detected"
        assert "similarity_score" not in event_attrs
