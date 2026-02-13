/**
 * Example: AIP OTel Exporter with Langfuse
 *
 * Langfuse supports OTLP trace ingestion. Configure the OTLP endpoint
 * and create a recorder to send AIP integrity data to Langfuse.
 */
import { NodeTracerProvider, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { createAIPOTelRecorder } from "@mnemom/aip-otel-exporter";

// Configure OTLP exporter pointing at Langfuse
const exporter = new OTLPTraceExporter({
  url: "https://cloud.langfuse.com/api/public/otel/v1/traces",
  headers: {
    Authorization: "Bearer <your-langfuse-public-key>",
  },
});

const provider = new NodeTracerProvider();
provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
provider.register();

// Create the AIP recorder
const recorder = createAIPOTelRecorder({ tracerProvider: provider });

// After each AIP integrity check:
// recorder.recordIntegrityCheck(signal);

// After each AAP verification:
// recorder.recordVerification(result);
