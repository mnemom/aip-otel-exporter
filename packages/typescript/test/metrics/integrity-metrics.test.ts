import { describe, it, expect } from "vitest";
import {
  createAIPMetrics,
  recordIntegrityMetrics,
  recordVerificationMetrics,
  recordCoherenceMetrics,
  recordDriftMetrics,
} from "../../src/metrics/integrity-metrics.js";
import type { AIPMetrics } from "../../src/metrics/integrity-metrics.js";
import type {
  IntegritySignalInput,
  VerificationResultInput,
  CoherenceResultInput,
  DriftAlertInput,
} from "../../src/types.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const INTEGRITY_SIGNAL: IntegritySignalInput = {
  checkpoint: {
    checkpoint_id: "ic-1",
    agent_id: "agent-1",
    verdict: "review_needed",
    concerns: [
      {
        category: "value_misalignment",
        severity: "medium",
        description: "test",
      },
    ],
    analysis_metadata: {
      analysis_duration_ms: 200,
    },
  },
  window_summary: {
    integrity_ratio: 0.75,
    drift_alert_active: true,
  },
};

const VERIFICATION_RESULT: VerificationResultInput = {
  verified: false,
  card_id: "card-1",
  violations: [
    {
      type: "forbidden_action",
      severity: "critical",
      description: "Forbidden",
    },
  ],
  verification_metadata: {
    duration_ms: 100,
  },
};

const COHERENCE_RESULT: CoherenceResultInput = {
  compatible: true,
  score: 0.88,
};

const DRIFT_ALERTS: DriftAlertInput[] = [
  {
    agent_id: "agent-1",
    analysis: {
      drift_direction: "restrictive",
    },
  },
  {
    agent_id: "agent-2",
    analysis: {
      drift_direction: "permissive",
    },
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createAIPMetrics", () => {
  it("should return all metric instruments", () => {
    const m = createAIPMetrics();

    expect(m.integrityChecks).toBeDefined();
    expect(m.concerns).toBeDefined();
    expect(m.analysisDuration).toBeDefined();
    expect(m.integrityRatio).toBeDefined();
    expect(m.driftAlerts).toBeDefined();
    expect(m.verifications).toBeDefined();
    expect(m.violations).toBeDefined();
    expect(m.verificationDuration).toBeDefined();
    expect(m.coherenceScore).toBeDefined();
  });

  it("should return instruments with add/record methods", () => {
    const m = createAIPMetrics();

    // Counters have add
    expect(typeof m.integrityChecks.add).toBe("function");
    expect(typeof m.concerns.add).toBe("function");
    expect(typeof m.driftAlerts.add).toBe("function");
    expect(typeof m.verifications.add).toBe("function");
    expect(typeof m.violations.add).toBe("function");

    // Histograms have record
    expect(typeof m.analysisDuration.record).toBe("function");
    expect(typeof m.integrityRatio.record).toBe("function");
    expect(typeof m.verificationDuration.record).toBe("function");
    expect(typeof m.coherenceScore.record).toBe("function");
  });
});

describe("recordIntegrityMetrics", () => {
  it("should not throw with full signal", () => {
    const m = createAIPMetrics();
    expect(() => recordIntegrityMetrics(m, INTEGRITY_SIGNAL)).not.toThrow();
  });

  it("should not throw with minimal signal", () => {
    const m = createAIPMetrics();
    expect(() =>
      recordIntegrityMetrics(m, { checkpoint: {} })
    ).not.toThrow();
  });

  it("should not throw with empty concerns", () => {
    const m = createAIPMetrics();
    const signal: IntegritySignalInput = {
      checkpoint: { verdict: "clear", concerns: [] },
    };
    expect(() => recordIntegrityMetrics(m, signal)).not.toThrow();
  });
});

describe("recordVerificationMetrics", () => {
  it("should not throw with full result", () => {
    const m = createAIPMetrics();
    expect(() =>
      recordVerificationMetrics(m, VERIFICATION_RESULT)
    ).not.toThrow();
  });

  it("should not throw with minimal result", () => {
    const m = createAIPMetrics();
    expect(() => recordVerificationMetrics(m, {})).not.toThrow();
  });

  it("should not throw with empty violations", () => {
    const m = createAIPMetrics();
    expect(() =>
      recordVerificationMetrics(m, { verified: true, violations: [] })
    ).not.toThrow();
  });
});

describe("recordCoherenceMetrics", () => {
  it("should not throw with full result", () => {
    const m = createAIPMetrics();
    expect(() => recordCoherenceMetrics(m, COHERENCE_RESULT)).not.toThrow();
  });

  it("should not throw with missing score", () => {
    const m = createAIPMetrics();
    expect(() => recordCoherenceMetrics(m, { compatible: true })).not.toThrow();
  });

  it("should not throw with empty result", () => {
    const m = createAIPMetrics();
    expect(() => recordCoherenceMetrics(m, {})).not.toThrow();
  });
});

describe("recordDriftMetrics", () => {
  it("should not throw with alerts", () => {
    const m = createAIPMetrics();
    expect(() => recordDriftMetrics(m, DRIFT_ALERTS)).not.toThrow();
  });

  it("should not throw with empty alerts", () => {
    const m = createAIPMetrics();
    expect(() => recordDriftMetrics(m, [])).not.toThrow();
  });

  it("should not throw with sparse alert data", () => {
    const m = createAIPMetrics();
    expect(() => recordDriftMetrics(m, [{}])).not.toThrow();
  });
});
