/**
 * Auto-instrumentation for AIP client.
 *
 * Wraps AIPClient.prototype.check() to automatically record integrity
 * check spans after each call. Node.js only.
 */

import { type Tracer, trace } from "@opentelemetry/api";
import { recordIntegrityCheck } from "../manual/record-integrity-check.js";

type AnyFunction = (...args: unknown[]) => unknown;

interface PatchState {
  originalCheck: AnyFunction | null;
  patched: boolean;
}

const state: PatchState = {
  originalCheck: null,
  patched: false,
};

/**
 * Instrument the AIP client to auto-record integrity checks.
 *
 * Attempts to require/import `@mnemom/agent-integrity-protocol` and
 * monkey-patch `AIPClient.prototype.check` to call `recordIntegrityCheck`
 * after each invocation.
 */
export function instrumentAIP(options?: {
  tracerProvider?: { getTracer: (name: string, version?: string) => Tracer };
}): void {
  if (state.patched) return;

  const tracer = options?.tracerProvider
    ? options.tracerProvider.getTracer("@mnemom/aip-otel-exporter", "0.1.0")
    : trace.getTracer("@mnemom/aip-otel-exporter", "0.1.0");

  let AIPClient: { prototype: Record<string, AnyFunction> } | undefined;
  try {
    // Dynamic require for Node.js — won't work in CF Workers (expected)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const aipModule = require("@mnemom/agent-integrity-protocol");
    AIPClient = aipModule.AIPClient ?? aipModule.default?.AIPClient;
  } catch {
    // Package not installed — nothing to instrument
    return;
  }

  if (!AIPClient?.prototype?.check) return;

  state.originalCheck = AIPClient.prototype.check;
  const originalCheck = state.originalCheck;

  AIPClient.prototype.check = function wrappedCheck(
    this: unknown,
    ...args: unknown[]
  ) {
    const result = originalCheck!.call(this, ...args);

    // Handle both sync and async results
    if (result && typeof (result as Promise<unknown>).then === "function") {
      return (result as Promise<unknown>).then((signal: unknown) => {
        if (signal && typeof signal === "object") {
          try {
            recordIntegrityCheck(
              tracer,
              signal as Parameters<typeof recordIntegrityCheck>[1]
            );
          } catch {
            // Never let instrumentation break the application
          }
        }
        return signal;
      });
    }

    if (result && typeof result === "object") {
      try {
        recordIntegrityCheck(
          tracer,
          result as Parameters<typeof recordIntegrityCheck>[1]
        );
      } catch {
        // Never let instrumentation break the application
      }
    }
    return result;
  };

  state.patched = true;
}

/** Remove AIP instrumentation, restoring original methods. */
export function uninstrumentAIP(): void {
  if (!state.patched || !state.originalCheck) return;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const aipModule = require("@mnemom/agent-integrity-protocol");
    const AIPClient = aipModule.AIPClient ?? aipModule.default?.AIPClient;
    if (AIPClient?.prototype) {
      AIPClient.prototype.check = state.originalCheck;
    }
  } catch {
    // Package not available
  }

  state.originalCheck = null;
  state.patched = false;
}
