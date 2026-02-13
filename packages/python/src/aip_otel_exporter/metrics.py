"""
AIP/AAP metrics instruments: counters and histograms.

Provides ``create_aip_metrics`` to build a dict of named OTel metric
instruments, plus helper functions to record metrics from integrity signals
and verification results.
"""

from __future__ import annotations

from typing import Any

from opentelemetry import metrics

from . import attributes as attr


def create_aip_metrics(
    meter_provider: metrics.MeterProvider | None = None,
) -> dict[str, Any]:
    """
    Create AIP/AAP metrics instruments.

    Args:
        meter_provider: Optional MeterProvider. Falls back to the global
            meter provider when not supplied.

    Returns:
        A dict mapping short names to OTel metric instruments.
    """
    kwargs: dict[str, Any] = {}
    if meter_provider is not None:
        kwargs["meter_provider"] = meter_provider
    meter = metrics.get_meter("aip-otel-exporter", **kwargs)

    return {
        "integrity_checks": meter.create_counter(
            attr.METRIC_AIP_INTEGRITY_CHECKS_TOTAL,
            description="Total AIP integrity checks",
        ),
        "concerns": meter.create_counter(
            attr.METRIC_AIP_CONCERNS_TOTAL,
            description="Total AIP concerns raised",
        ),
        "analysis_duration": meter.create_histogram(
            attr.METRIC_AIP_ANALYSIS_DURATION,
            description="AIP analysis duration in ms",
            unit="ms",
        ),
        "integrity_ratio": meter.create_histogram(
            attr.METRIC_AIP_WINDOW_INTEGRITY_RATIO,
            description="Window integrity ratio",
        ),
        "drift_alerts": meter.create_counter(
            attr.METRIC_AIP_DRIFT_ALERTS_TOTAL,
            description="Total drift alerts",
        ),
        "verifications": meter.create_counter(
            attr.METRIC_AAP_VERIFICATIONS_TOTAL,
            description="Total AAP verifications",
        ),
        "violations": meter.create_counter(
            attr.METRIC_AAP_VIOLATIONS_TOTAL,
            description="Total AAP violations",
        ),
        "verification_duration": meter.create_histogram(
            attr.METRIC_AAP_VERIFICATION_DURATION,
            description="AAP verification duration in ms",
            unit="ms",
        ),
        "coherence_score": meter.create_histogram(
            attr.METRIC_AAP_COHERENCE_SCORE,
            description="AAP coherence score",
        ),
    }


def record_integrity_metrics(
    metrics_dict: dict[str, Any],
    signal: dict[str, Any],
) -> None:
    """
    Record metrics from an AIP integrity signal.

    Increments the integrity_checks counter, adds concern counts, records
    analysis duration and window integrity ratio when available.

    Args:
        metrics_dict: The dict returned by ``create_aip_metrics()``.
        signal: An AIP IntegritySignal-shaped dict.
    """
    signal = signal or {}
    cp = signal.get("checkpoint") or {}
    meta = cp.get("analysis_metadata") or {}
    win = signal.get("window_summary") or {}

    verdict = cp.get("verdict") or "unknown"

    # Increment integrity checks counter
    metrics_dict["integrity_checks"].add(1, {"verdict": verdict})

    # Count concerns
    concerns = cp.get("concerns")
    if concerns:
        metrics_dict["concerns"].add(len(concerns), {"verdict": verdict})

    # Record analysis duration
    duration = meta.get("analysis_duration_ms")
    if duration is not None:
        metrics_dict["analysis_duration"].record(duration, {"verdict": verdict})

    # Record window integrity ratio
    ratio = win.get("integrity_ratio")
    if ratio is not None:
        metrics_dict["integrity_ratio"].record(ratio)

    # Count drift alerts
    if win.get("drift_alert_active"):
        metrics_dict["drift_alerts"].add(1)


def record_verification_metrics(
    metrics_dict: dict[str, Any],
    result: dict[str, Any],
) -> None:
    """
    Record metrics from an AAP verification result.

    Increments the verifications counter, adds violation counts, and records
    verification duration when available.

    Args:
        metrics_dict: The dict returned by ``create_aip_metrics()``.
        result: An AAP VerificationResult-shaped dict.
    """
    result = result or {}
    meta = result.get("verification_metadata") or {}

    verified = result.get("verified")
    result_label = "pass" if verified else "fail" if verified is not None else "unknown"

    # Increment verifications counter
    metrics_dict["verifications"].add(1, {"result": result_label})

    # Count violations
    violations = result.get("violations")
    if violations:
        metrics_dict["violations"].add(len(violations), {"result": result_label})

    # Record verification duration
    duration = meta.get("duration_ms")
    if duration is not None:
        metrics_dict["verification_duration"].record(duration, {"result": result_label})

    # Record coherence score if present (for coherence results piped here)
    score = result.get("score")
    if score is not None:
        metrics_dict["coherence_score"].record(score)
