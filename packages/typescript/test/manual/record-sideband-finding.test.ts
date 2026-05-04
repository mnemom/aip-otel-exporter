import { describe, it, expect, beforeEach } from "vitest";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import { recordSidebandFinding } from "../../src/manual/record-sideband-finding.js";
import * as attr from "../../src/attributes.js";

let exporter: InMemorySpanExporter;
let provider: BasicTracerProvider;

function setup() {
  exporter = new InMemorySpanExporter();
  provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
}

function getFinishedSpans(): ReadableSpan[] {
  return exporter.getFinishedSpans();
}

describe("recordSidebandFinding", () => {
  beforeEach(() => setup());

  it("creates a span named safe_house.sideband.finding", () => {
    const tracer = provider.getTracer("test");
    recordSidebandFinding(tracer, {
      source: "sideband.coherence",
      team_id: "tm-acme",
      finding_count: 2,
      severity: "medium",
      pattern_type: "outliers",
    });

    const spans = getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe("safe_house.sideband.finding");
  });

  it("sets all attributes when fully populated", () => {
    const tracer = provider.getTracer("test");
    recordSidebandFinding(tracer, {
      source: "sideband.fault_line",
      team_id: "tm-banking",
      finding_count: 4,
      severity: "high",
      pattern_type: "transparency",
    });
    const a = getFinishedSpans()[0].attributes;
    expect(a[attr.SAFE_HOUSE_SIDEBAND_SOURCE]).toBe("sideband.fault_line");
    expect(a[attr.SAFE_HOUSE_SIDEBAND_AXIS]).toBe("fault_line");
    expect(a[attr.SAFE_HOUSE_SIDEBAND_TEAM_ID]).toBe("tm-banking");
    expect(a[attr.SAFE_HOUSE_SIDEBAND_FINDING_COUNT]).toBe(4);
    expect(a[attr.SAFE_HOUSE_SIDEBAND_SEVERITY]).toBe("high");
    expect(a[attr.SAFE_HOUSE_SIDEBAND_PATTERN_TYPE]).toBe("transparency");
  });

  it("derives axis from source when not provided", () => {
    const tracer = provider.getTracer("test");
    recordSidebandFinding(tracer, { source: "sideband.fleet" });
    const a = getFinishedSpans()[0].attributes;
    expect(a[attr.SAFE_HOUSE_SIDEBAND_AXIS]).toBe("fleet");
  });

  it("respects an explicit axis override", () => {
    const tracer = provider.getTracer("test");
    recordSidebandFinding(tracer, {
      source: "sideband.coherence.weakest_pair",
      axis: "coherence",
    });
    const a = getFinishedSpans()[0].attributes;
    expect(a[attr.SAFE_HOUSE_SIDEBAND_AXIS]).toBe("coherence");
  });

  it("emits exactly one event with the finding payload", () => {
    const tracer = provider.getTracer("test");
    recordSidebandFinding(tracer, {
      source: "sideband.fleet",
      team_id: "tm-7",
      pattern_type: "cluster_partition",
      finding_count: 5,
      severity: "critical",
    });
    const span = getFinishedSpans()[0];
    expect(span.events).toHaveLength(1);
    const evt = span.events[0];
    expect(evt.name).toBe("safe_house.sideband.finding");
    expect(evt.attributes?.source).toBe("sideband.fleet");
    expect(evt.attributes?.axis).toBe("fleet");
    expect(evt.attributes?.team_id).toBe("tm-7");
    expect(evt.attributes?.pattern_type).toBe("cluster_partition");
    expect(evt.attributes?.finding_count).toBe(5);
    expect(evt.attributes?.severity).toBe("critical");
  });

  it("omits optional attributes when not provided", () => {
    const tracer = provider.getTracer("test");
    recordSidebandFinding(tracer, { source: "sideband.drift" });
    const a = getFinishedSpans()[0].attributes;
    expect(a[attr.SAFE_HOUSE_SIDEBAND_TEAM_ID]).toBeUndefined();
    expect(a[attr.SAFE_HOUSE_SIDEBAND_SEVERITY]).toBeUndefined();
    expect(a[attr.SAFE_HOUSE_SIDEBAND_PATTERN_TYPE]).toBeUndefined();
    // finding_count defaults to 0 (always set, per recordDrift convention).
    expect(a[attr.SAFE_HOUSE_SIDEBAND_FINDING_COUNT]).toBe(0);
  });

  it("accepts unknown sources verbatim (forward-compat per ADR-047)", () => {
    const tracer = provider.getTracer("test");
    recordSidebandFinding(tracer, { source: "sideband.anomaly" });
    const a = getFinishedSpans()[0].attributes;
    expect(a[attr.SAFE_HOUSE_SIDEBAND_SOURCE]).toBe("sideband.anomaly");
    expect(a[attr.SAFE_HOUSE_SIDEBAND_AXIS]).toBe("anomaly");
  });
});
