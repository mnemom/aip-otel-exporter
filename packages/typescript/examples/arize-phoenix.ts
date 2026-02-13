/**
 * Example: AIP OTel Exporter with Arize Phoenix
 *
 * Arize Phoenix accepts traces via a standard OTLP/HTTP endpoint.
 * Point the exporter at your Phoenix instance and record AIP signals.
 */
import { NodeTracerProvider, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { createAIPOTelRecorder } from "@mnemom/aip-otel-exporter";

// Configure OTLP exporter pointing at Arize Phoenix
const exporter = new OTLPTraceExporter({
  url: "http://localhost:6006/v1/traces", // default Phoenix OTLP endpoint
});

const provider = new NodeTracerProvider();
provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
provider.register();

// Create the AIP recorder
const recorder = createAIPOTelRecorder({ tracerProvider: provider });

// After each AIP integrity check:
// recorder.recordIntegrityCheck(signal);

// After each AAP coherence check:
// recorder.recordCoherence(result);
