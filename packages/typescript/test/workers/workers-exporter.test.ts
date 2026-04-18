import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { createWorkersExporter, normalizeTracesEndpoint } from "../../src/workers/workers-exporter.js";
import type { IntegritySignalInput } from "../../src/types.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FIXTURE_SIGNAL: IntegritySignalInput = {
  checkpoint: {
    checkpoint_id: "ic-test-1",
    agent_id: "agent-1",
    card_id: "card-1",
    session_id: "session-1",
    verdict: "clear",
    concerns: [],
  },
  proceed: true,
  recommended_action: "continue",
  window_summary: {
    size: 3,
    integrity_ratio: 1.0,
    drift_alert_active: false,
  },
};

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(new Response("OK", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("normalizeTracesEndpoint", () => {
  it("appends /v1/traces to a bare OTLP base", () => {
    expect(normalizeTracesEndpoint("https://otlp-gateway-prod.grafana.net/otlp"))
      .toBe("https://otlp-gateway-prod.grafana.net/otlp/v1/traces");
  });

  it("is idempotent when /v1/traces is already present", () => {
    const full = "https://otlp-gateway-prod.grafana.net/otlp/v1/traces";
    expect(normalizeTracesEndpoint(full)).toBe(full);
  });

  it("trims trailing slashes before appending", () => {
    expect(normalizeTracesEndpoint("https://otlp.example.com/otlp///"))
      .toBe("https://otlp.example.com/otlp/v1/traces");
  });

  it("trims a trailing slash off a full path", () => {
    expect(normalizeTracesEndpoint("https://otlp.example.com/otlp/v1/traces/"))
      .toBe("https://otlp.example.com/otlp/v1/traces");
  });
});

describe("createWorkersExporter — endpoint normalization", () => {
  it("POSTs to a normalized URL when the endpoint omits /v1/traces", async () => {
    const exporter = createWorkersExporter({
      endpoint: "https://otlp.example.com/otlp",
    });

    exporter.recordIntegrityCheck(FIXTURE_SIGNAL);
    await exporter.flush();

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("https://otlp.example.com/otlp/v1/traces");
  });

  it("leaves an already-normalized endpoint unchanged", async () => {
    const exporter = createWorkersExporter({
      endpoint: "https://otlp.example.com/otlp/v1/traces",
    });

    exporter.recordIntegrityCheck(FIXTURE_SIGNAL);
    await exporter.flush();

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("https://otlp.example.com/otlp/v1/traces");
  });
});

describe("createWorkersExporter", () => {
  it("should buffer and flush spans via fetch", async () => {
    const exporter = createWorkersExporter({
      endpoint: "https://otel.example.com/v1/traces",
    });

    exporter.recordIntegrityCheck(FIXTURE_SIGNAL);
    await exporter.flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://otel.example.com/v1/traces");
    expect(options.method).toBe("POST");
    expect(options.headers["Content-Type"]).toBe("application/json");

    // Verify body is valid OTLP JSON
    const body = JSON.parse(options.body);
    expect(body.resourceSpans).toHaveLength(1);
    const spans = body.resourceSpans[0].scopeSpans[0].spans;
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe("aip.integrity_check");
  });

  it("should include authorization header when configured", async () => {
    const exporter = createWorkersExporter({
      endpoint: "https://otel.example.com/v1/traces",
      authorization: "Bearer my-secret-token",
    });

    exporter.recordIntegrityCheck(FIXTURE_SIGNAL);
    await exporter.flush();

    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers["Authorization"]).toBe("Bearer my-secret-token");
  });

  it("should include custom headers", async () => {
    const exporter = createWorkersExporter({
      endpoint: "https://otel.example.com/v1/traces",
      headers: { "X-Custom": "test-value" },
    });

    exporter.recordIntegrityCheck(FIXTURE_SIGNAL);
    await exporter.flush();

    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers["X-Custom"]).toBe("test-value");
  });

  it("should auto-flush when batch size exceeded", async () => {
    const exporter = createWorkersExporter({
      endpoint: "https://otel.example.com/v1/traces",
      maxBatchSize: 2,
    });

    // Record 2 signals to exceed max batch size
    exporter.recordIntegrityCheck(FIXTURE_SIGNAL);
    exporter.recordIntegrityCheck(FIXTURE_SIGNAL);

    // Wait a tick for the fire-and-forget flush to complete
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const spans = body.resourceSpans[0].scopeSpans[0].spans;
    expect(spans).toHaveLength(2);
  });

  it("should be no-op when buffer is empty", async () => {
    const exporter = createWorkersExporter({
      endpoint: "https://otel.example.com/v1/traces",
    });

    await exporter.flush();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("should use custom service name", async () => {
    const exporter = createWorkersExporter({
      endpoint: "https://otel.example.com/v1/traces",
      serviceName: "my-custom-service",
    });

    exporter.recordIntegrityCheck(FIXTURE_SIGNAL);
    await exporter.flush();

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const resourceAttrs = body.resourceSpans[0].resource.attributes;
    expect(resourceAttrs).toEqual([
      { key: "service.name", value: { stringValue: "my-custom-service" } },
    ]);
  });

  it("should record verification results", async () => {
    const exporter = createWorkersExporter({
      endpoint: "https://otel.example.com/v1/traces",
    });

    exporter.recordVerification({
      verified: true,
      trace_id: "trace-1",
      card_id: "card-1",
    });
    await exporter.flush();

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const spans = body.resourceSpans[0].scopeSpans[0].spans;
    expect(spans[0].name).toBe("aap.verify_trace");
  });

  it("should record coherence results", async () => {
    const exporter = createWorkersExporter({
      endpoint: "https://otel.example.com/v1/traces",
    });

    exporter.recordCoherence({
      compatible: true,
      score: 0.9,
      proceed: true,
    });
    await exporter.flush();

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const spans = body.resourceSpans[0].scopeSpans[0].spans;
    expect(spans[0].name).toBe("aap.check_coherence");
  });

  it("should record drift alerts", async () => {
    const exporter = createWorkersExporter({
      endpoint: "https://otel.example.com/v1/traces",
    });

    exporter.recordDrift(
      [
        {
          alert_type: "behavioral_drift",
          agent_id: "agent-1",
          analysis: { similarity_score: 0.4, drift_direction: "permissive" },
        },
      ],
      20
    );
    await exporter.flush();

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const spans = body.resourceSpans[0].scopeSpans[0].spans;
    expect(spans[0].name).toBe("aap.detect_drift");
    expect(spans[0].events).toHaveLength(1);
    expect(spans[0].events[0].name).toBe("aap.drift_alert");
  });

  it("should clear buffer after flush", async () => {
    const exporter = createWorkersExporter({
      endpoint: "https://otel.example.com/v1/traces",
    });

    exporter.recordIntegrityCheck(FIXTURE_SIGNAL);
    await exporter.flush();

    // Second flush should be no-op
    await exporter.flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("should batch multiple records into single flush", async () => {
    const exporter = createWorkersExporter({
      endpoint: "https://otel.example.com/v1/traces",
    });

    exporter.recordIntegrityCheck(FIXTURE_SIGNAL);
    exporter.recordVerification({ verified: true });
    exporter.recordCoherence({ compatible: true, score: 0.9 });
    await exporter.flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const spans = body.resourceSpans[0].scopeSpans[0].spans;
    expect(spans).toHaveLength(3);
  });

  describe("recordSpan (generic)", () => {
    it("should emit a span with the given name and default OK status", async () => {
      const exporter = createWorkersExporter({
        endpoint: "https://otel.example.com/v1/traces",
      });

      exporter.recordSpan({ name: "auth.signin.success" });
      await exporter.flush();

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      const spans = body.resourceSpans[0].scopeSpans[0].spans;
      expect(spans).toHaveLength(1);
      expect(spans[0].name).toBe("auth.signin.success");
      expect(spans[0].kind).toBe(1); // INTERNAL
      expect(spans[0].status).toEqual({ code: 1 }); // OK
      expect(spans[0].attributes).toEqual([]);
      expect(spans[0].events).toEqual([]);
    });

    it("should serialize attributes and drop undefined/null values", async () => {
      const exporter = createWorkersExporter({
        endpoint: "https://otel.example.com/v1/traces",
      });

      exporter.recordSpan({
        name: "auth.signin.failure",
        attributes: {
          reason: "bad_credentials",
          env: "production",
          retry_count: 3,
          dropped_undef: undefined,
          dropped_null: null,
        },
      });
      await exporter.flush();

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      const span = body.resourceSpans[0].scopeSpans[0].spans[0];
      const attrKeys = span.attributes.map((a: { key: string }) => a.key);
      expect(attrKeys).toEqual(["reason", "env", "retry_count"]);
    });

    it("should honor error status", async () => {
      const exporter = createWorkersExporter({
        endpoint: "https://otel.example.com/v1/traces",
      });

      exporter.recordSpan({
        name: "auth.cookie.decrypt_failed",
        status: "error",
      });
      await exporter.flush();

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      const span = body.resourceSpans[0].scopeSpans[0].spans[0];
      expect(span.status).toEqual({ code: 2 }); // ERROR
    });

    it("should honor unset status", async () => {
      const exporter = createWorkersExporter({
        endpoint: "https://otel.example.com/v1/traces",
      });

      exporter.recordSpan({ name: "auth.event.raw", status: "unset" });
      await exporter.flush();

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      const span = body.resourceSpans[0].scopeSpans[0].spans[0];
      expect(span.status).toEqual({ code: 0 }); // UNSET
    });

    it("should serialize events with their own attributes", async () => {
      const exporter = createWorkersExporter({
        endpoint: "https://otel.example.com/v1/traces",
      });

      exporter.recordSpan({
        name: "auth.mfa.challenge",
        events: [
          { name: "auth.mfa.factor_selected", attributes: { factor_type: "totp" } },
        ],
      });
      await exporter.flush();

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      const span = body.resourceSpans[0].scopeSpans[0].spans[0];
      expect(span.events).toHaveLength(1);
      expect(span.events[0].name).toBe("auth.mfa.factor_selected");
      expect(span.events[0].attributes).toEqual([
        { key: "factor_type", value: { stringValue: "totp" } },
      ]);
    });

    it("should interoperate with the AIP record* methods in one flush", async () => {
      const exporter = createWorkersExporter({
        endpoint: "https://otel.example.com/v1/traces",
      });

      exporter.recordIntegrityCheck(FIXTURE_SIGNAL);
      exporter.recordSpan({
        name: "auth.legacy_bearer_from_browser",
        attributes: { env: "production", path_class: "/v1/auth/me" },
      });
      await exporter.flush();

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      const spans = body.resourceSpans[0].scopeSpans[0].spans;
      expect(spans).toHaveLength(2);
      const names = spans.map((s: { name: string }) => s.name).sort();
      expect(names).toEqual([
        "aip.integrity_check",
        "auth.legacy_bearer_from_browser",
      ]);
    });
  });
});
