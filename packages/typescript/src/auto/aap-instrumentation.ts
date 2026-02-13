/**
 * Auto-instrumentation for AAP verification functions.
 *
 * Wraps verifyTrace, checkCoherence, and detectDrift exports to
 * automatically record OTel spans. Node.js only.
 */

import { type Tracer, trace } from "@opentelemetry/api";
import { recordVerification } from "../manual/record-verification.js";
import { recordCoherence } from "../manual/record-coherence.js";
import { recordDrift } from "../manual/record-drift.js";

type AnyFunction = (...args: unknown[]) => unknown;

interface PatchState {
  originalVerifyTrace: AnyFunction | null;
  originalCheckCoherence: AnyFunction | null;
  originalDetectDrift: AnyFunction | null;
  aapModule: Record<string, AnyFunction> | null;
  patched: boolean;
}

const state: PatchState = {
  originalVerifyTrace: null,
  originalCheckCoherence: null,
  originalDetectDrift: null,
  aapModule: null,
  patched: false,
};

function wrapAsync<T>(
  original: AnyFunction,
  recorder: (tracer: Tracer, result: T) => void,
  tracer: Tracer
): AnyFunction {
  return function wrappedFn(this: unknown, ...args: unknown[]) {
    const result = original.call(this, ...args);

    if (result && typeof (result as Promise<unknown>).then === "function") {
      return (result as Promise<unknown>).then((value: unknown) => {
        if (value && typeof value === "object") {
          try {
            recorder(tracer, value as T);
          } catch {
            // Never break the application
          }
        }
        return value;
      });
    }

    if (result && typeof result === "object") {
      try {
        recorder(tracer, result as T);
      } catch {
        // Never break the application
      }
    }
    return result;
  };
}

/**
 * Instrument AAP verification functions to auto-record spans.
 *
 * Attempts to require `@mnemom/agent-alignment-protocol` and wrap:
 * - verifyTrace → recordVerification
 * - checkCoherence → recordCoherence
 * - detectDrift → recordDrift
 */
export function instrumentAAP(options?: {
  tracerProvider?: { getTracer: (name: string, version?: string) => Tracer };
}): void {
  if (state.patched) return;

  const tracer = options?.tracerProvider
    ? options.tracerProvider.getTracer("@mnemom/aip-otel-exporter", "0.1.0")
    : trace.getTracer("@mnemom/aip-otel-exporter", "0.1.0");

  let aapModule: Record<string, AnyFunction>;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    aapModule = require("@mnemom/agent-alignment-protocol");
  } catch {
    return;
  }

  state.aapModule = aapModule;

  if (typeof aapModule.verifyTrace === "function") {
    state.originalVerifyTrace = aapModule.verifyTrace;
    aapModule.verifyTrace = wrapAsync(
      state.originalVerifyTrace!,
      recordVerification,
      tracer
    );
  }

  if (typeof aapModule.checkCoherence === "function") {
    state.originalCheckCoherence = aapModule.checkCoherence;
    aapModule.checkCoherence = wrapAsync(
      state.originalCheckCoherence!,
      recordCoherence,
      tracer
    );
  }

  if (typeof aapModule.detectDrift === "function") {
    state.originalDetectDrift = aapModule.detectDrift;
    aapModule.detectDrift = wrapAsync(
      state.originalDetectDrift!,
      (tracer: Tracer, result: unknown) => {
        // detectDrift returns an array of alerts
        if (Array.isArray(result)) {
          recordDrift(tracer, result);
        } else if (
          result &&
          typeof result === "object" &&
          "alerts" in (result as Record<string, unknown>)
        ) {
          const r = result as { alerts: unknown[]; traces_analyzed?: number };
          recordDrift(tracer, r.alerts as Parameters<typeof recordDrift>[1], r.traces_analyzed);
        }
      },
      tracer
    );
  }

  state.patched = true;
}

/** Remove AAP instrumentation, restoring original functions. */
export function uninstrumentAAP(): void {
  if (!state.patched || !state.aapModule) return;

  if (state.originalVerifyTrace) {
    state.aapModule.verifyTrace = state.originalVerifyTrace;
  }
  if (state.originalCheckCoherence) {
    state.aapModule.checkCoherence = state.originalCheckCoherence;
  }
  if (state.originalDetectDrift) {
    state.aapModule.detectDrift = state.originalDetectDrift;
  }

  state.originalVerifyTrace = null;
  state.originalCheckCoherence = null;
  state.originalDetectDrift = null;
  state.aapModule = null;
  state.patched = false;
}
