/**
 * Example: AIP OTel Exporter in Cloudflare Workers
 *
 * Uses the Workers adapter (no OTel SDK dependency).
 */
import { createWorkersExporter } from "@mnemom/aip-otel-exporter/workers";

export default {
  async fetch(request: Request, env: any, ctx: ExecutionContext) {
    const exporter = createWorkersExporter({
      endpoint: env.OTLP_ENDPOINT,
      authorization: `Bearer ${env.OTLP_TOKEN}`,
    });

    // ... your handler logic ...
    // After AIP integrity check:
    // exporter.recordIntegrityCheck(signal);

    // Flush spans before response completes
    ctx.waitUntil(exporter.flush());

    return new Response("OK");
  },
};
