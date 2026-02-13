"""Tests for the AIPOTelRecorder convenience class."""

import pytest
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from opentelemetry.trace import StatusCode

from aip_otel_exporter import AIPOTelRecorder
from aip_otel_exporter import attributes as attr


@pytest.fixture
def recorder_and_exporter():
    """Return an (AIPOTelRecorder, InMemorySpanExporter) pair."""
    exporter = InMemorySpanExporter()
    provider = TracerProvider()
    provider.add_span_processor(SimpleSpanProcessor(exporter))
    recorder = AIPOTelRecorder(tracer_provider=provider)
    return recorder, exporter


SIGNAL_FIXTURE = {
    "checkpoint": {
        "checkpoint_id": "ic-rec-001",
        "verdict": "clear",
        "concerns": [],
    },
    "proceed": True,
    "window_summary": {"size": 3, "integrity_ratio": 1.0, "drift_alert_active": False},
}


VERIFICATION_FIXTURE = {
    "verified": True,
    "trace_id": "trace-rec-001",
    "violations": [],
    "warnings": [],
    "similarity_score": 0.99,
}


COHERENCE_FIXTURE = {
    "compatible": True,
    "score": 0.95,
    "proceed": True,
    "value_alignment": {"matched": ["honesty"], "conflicts": []},
}


DRIFT_ALERTS_FIXTURE = [
    {
        "alert_type": "drift_detected",
        "agent_id": "agent-1",
        "analysis": {"similarity_score": 0.4, "drift_direction": "value_drift"},
        "recommendation": "review",
    },
]


class TestAIPOTelRecorder:
    def test_record_integrity_check(self, recorder_and_exporter):
        recorder, exporter = recorder_and_exporter
        recorder.record_integrity_check(SIGNAL_FIXTURE)
        spans = exporter.get_finished_spans()
        assert len(spans) == 1
        assert spans[0].name == "aip.integrity_check"
        attrs = dict(spans[0].attributes)
        assert attrs[attr.AIP_INTEGRITY_CHECKPOINT_ID] == "ic-rec-001"
        assert attrs[attr.AIP_INTEGRITY_VERDICT] == "clear"
        assert attrs[attr.AIP_INTEGRITY_PROCEED] is True

    def test_record_verification(self, recorder_and_exporter):
        recorder, exporter = recorder_and_exporter
        recorder.record_verification(VERIFICATION_FIXTURE)
        spans = exporter.get_finished_spans()
        assert len(spans) == 1
        assert spans[0].name == "aap.verify_trace"
        attrs = dict(spans[0].attributes)
        assert attrs[attr.AAP_VERIFICATION_RESULT] is True
        assert attrs[attr.AAP_VERIFICATION_TRACE_ID] == "trace-rec-001"
        assert attrs[attr.AAP_VERIFICATION_SIMILARITY_SCORE] == 0.99

    def test_record_coherence(self, recorder_and_exporter):
        recorder, exporter = recorder_and_exporter
        recorder.record_coherence(COHERENCE_FIXTURE)
        spans = exporter.get_finished_spans()
        assert len(spans) == 1
        assert spans[0].name == "aap.check_coherence"
        attrs = dict(spans[0].attributes)
        assert attrs[attr.AAP_COHERENCE_COMPATIBLE] is True
        assert attrs[attr.AAP_COHERENCE_SCORE] == 0.95
        assert attrs[attr.AAP_COHERENCE_MATCHED_COUNT] == 1

    def test_record_drift(self, recorder_and_exporter):
        recorder, exporter = recorder_and_exporter
        recorder.record_drift(DRIFT_ALERTS_FIXTURE, traces_analyzed=15)
        spans = exporter.get_finished_spans()
        assert len(spans) == 1
        assert spans[0].name == "aap.detect_drift"
        attrs = dict(spans[0].attributes)
        assert attrs[attr.AAP_DRIFT_ALERTS_COUNT] == 1
        assert attrs[attr.AAP_DRIFT_TRACES_ANALYZED] == 15
        drift_events = [e for e in spans[0].events if e.name == "aap.drift_alert"]
        assert len(drift_events) == 1

    def test_all_spans_have_status_ok(self, recorder_and_exporter):
        recorder, exporter = recorder_and_exporter
        recorder.record_integrity_check(SIGNAL_FIXTURE)
        recorder.record_verification(VERIFICATION_FIXTURE)
        recorder.record_coherence(COHERENCE_FIXTURE)
        recorder.record_drift(DRIFT_ALERTS_FIXTURE)
        spans = exporter.get_finished_spans()
        assert len(spans) == 4
        for span in spans:
            assert span.status.status_code == StatusCode.OK

    def test_custom_tracer_name(self):
        """AIPOTelRecorder should accept a custom tracer name without error."""
        exporter = InMemorySpanExporter()
        provider = TracerProvider()
        provider.add_span_processor(SimpleSpanProcessor(exporter))
        recorder = AIPOTelRecorder(tracer_provider=provider, tracer_name="my-custom-tracer")
        recorder.record_integrity_check({"checkpoint": {"verdict": "clear"}})
        spans = exporter.get_finished_spans()
        assert len(spans) == 1
