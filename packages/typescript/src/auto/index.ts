/**
 * Auto-instrumentation entry point.
 *
 * Usage:
 *   import { instrument } from '@mnemom/aip-otel-exporter/auto';
 *   instrument();
 */

import type { Tracer } from "@opentelemetry/api";
import { instrumentAIP, uninstrumentAIP } from "./aip-instrumentation.js";
import { instrumentAAP, uninstrumentAAP } from "./aap-instrumentation.js";

export interface InstrumentOptions {
  tracerProvider?: { getTracer: (name: string, version?: string) => Tracer };
}

/** Instrument both AIP and AAP for automatic span recording. */
export function instrument(options?: InstrumentOptions): void {
  instrumentAIP(options);
  instrumentAAP(options);
}

/** Remove all instrumentation. */
export function uninstrument(): void {
  uninstrumentAIP();
  uninstrumentAAP();
}

export { instrumentAIP, uninstrumentAIP } from "./aip-instrumentation.js";
export { instrumentAAP, uninstrumentAAP } from "./aap-instrumentation.js";
