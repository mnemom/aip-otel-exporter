/**
 * Example: AIP OTel Exporter with Datadog
 *
 * The Datadog Agent accepts OTLP traces on localhost:4318 by default.
 * Enable OTLP ingestion in your datadog.yaml:
 *   otlp_config:
 *     receiver:
 *       protocols:
 *         http:
 *           endpoint: 0.0.0.0:4318
 */
import { NodeTracerProvider, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { createAIPOTelRecorder } from "@mnemom/aip-otel-exporter";

// Configure OTLP exporter pointing at the Datadog Agent
const exporter = new OTLPTraceExporter({
  url: "http://localhost:4318/v1/traces",
});

const provider = new NodeTracerProvider();
provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
provider.register();

// Create the AIP recorder
const recorder = createAIPOTelRecorder({ tracerProvider: provider });

// After each AIP integrity check:
// recorder.recordIntegrityCheck(signal);

// After each AAP drift detection:
// recorder.recordDrift(alerts, tracesAnalyzed);
