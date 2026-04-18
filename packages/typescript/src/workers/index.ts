/**
 * Cloudflare Workers subpath entry point.
 *
 * Import via: `import { createWorkersExporter } from "@mnemom/aip-otel-exporter/workers"`
 */

export { createWorkersExporter, normalizeTracesEndpoint } from "./workers-exporter.js";
export type { WorkersExporterConfig, WorkersOTelExporter } from "../types.js";
