/**
 * Records a Safe House sideband detector firing as an OpenTelemetry span.
 *
 * Sideband detectors (coherence, fault-line, fleet, drift) run on the
 * observer's cron sweep and emit findings that cross to runtime via
 * `pending_advisories` (ADR-040 / ADR-045 / ADR-047). This recorder
 * captures one OTel span per detector firing — useful for proof-of-
 * coverage queries, alerting on burst rates, and cross-correlating
 * with the runtime injection events on the agent's next turn.
 *
 * Per ADR-047, the source enum is closed and hierarchical
 * (`<context>.<axis>[.<event>]`). Adding a new source means an ADR
 * amendment + migration + producer + consumer-tolerance pass; this
 * exporter accepts any string verbatim so new sources require no
 * exporter change.
 */

import type { Span, Tracer, Attributes } from "@opentelemetry/api";

import {
  SPAN_SAFE_HOUSE_SIDEBAND_FINDING,
  EVENT_SAFE_HOUSE_SIDEBAND_FINDING,
  SAFE_HOUSE_SIDEBAND_SOURCE,
  SAFE_HOUSE_SIDEBAND_AXIS,
  SAFE_HOUSE_SIDEBAND_TEAM_ID,
  SAFE_HOUSE_SIDEBAND_FINDING_COUNT,
  SAFE_HOUSE_SIDEBAND_SEVERITY,
  SAFE_HOUSE_SIDEBAND_PATTERN_TYPE,
} from "../attributes.js";

import { buildSpan } from "./span-builder.js";

export type SidebandSeverity = "low" | "medium" | "high" | "critical";

export interface SidebandFindingInput {
  /**
   * Closed-but-extensible source enum value per ADR-047. Examples:
   * `sideband.coherence`, `sideband.fault_line`, `sideband.fleet`,
   * `sideband.drift`. Producers MUST write a value from the ratified
   * list at the time of writing; consumers MUST tolerate unknown values
   * gracefully (per ADR-047 expansion contract).
   */
  source: string;
  /** The detector axis. Convention: source.split(".").pop(). */
  axis?: string;
  /** Team the detector swept. Empty for non-team-scoped sources. */
  team_id?: string;
  /**
   * Number of pending_advisories rows the detector wrote on this firing.
   * Per the per-named-affected-agent fan-out rule (ADR-045 §2), this
   * equals the number of agents named in the finding.
   */
  finding_count?: number;
  /**
   * Severity stamped onto the advisory(ies) — composed from the team's
   * effective Posture severity_floor + the detector's natural severity
   * (max wins per ADR-045 §4 / Piece 6 audit-table P3).
   */
  severity?: SidebandSeverity;
  /**
   * Free-form discriminator for the firing condition within an axis.
   * Coherence: "outliers" | "conflict_edges" | "pairwise_floor" or a
   *   `|`-separated combination.
   * Fault-line: AAP severity tier ("high", "critical").
   * Fleet: "outliers" | "min_pair_score" | "cluster_partition".
   */
  pattern_type?: string;
}

/**
 * Record a sideband detector firing as an OTel span with finding events.
 *
 * Emits one span with attributes that name the firing axis + count, and
 * one event per finding that carries the per-finding context. Producers
 * call this fire-and-forget via `ctx.waitUntil(otelExporter.flush())`
 * after writing the pending_advisories rows.
 */
export function recordSidebandFinding(
  tracer: Tracer,
  finding: SidebandFindingInput,
): Span {
  const axis = finding.axis ?? finding.source.split(".").pop() ?? "unknown";

  const attributes: Record<string, unknown> = {
    [SAFE_HOUSE_SIDEBAND_SOURCE]: finding.source,
    [SAFE_HOUSE_SIDEBAND_AXIS]: axis,
    [SAFE_HOUSE_SIDEBAND_FINDING_COUNT]: finding.finding_count ?? 0,
  };
  if (finding.team_id) attributes[SAFE_HOUSE_SIDEBAND_TEAM_ID] = finding.team_id;
  if (finding.severity) attributes[SAFE_HOUSE_SIDEBAND_SEVERITY] = finding.severity;
  if (finding.pattern_type)
    attributes[SAFE_HOUSE_SIDEBAND_PATTERN_TYPE] = finding.pattern_type;

  const events: Array<{ name: string; attributes: Attributes }> = [
    {
      name: EVENT_SAFE_HOUSE_SIDEBAND_FINDING,
      attributes: {
        source: finding.source,
        axis,
        ...(finding.team_id !== undefined && { team_id: finding.team_id }),
        ...(finding.severity !== undefined && { severity: finding.severity }),
        ...(finding.pattern_type !== undefined && {
          pattern_type: finding.pattern_type,
        }),
        ...(finding.finding_count !== undefined && {
          finding_count: finding.finding_count,
        }),
      },
    },
  ];

  return buildSpan(tracer, SPAN_SAFE_HOUSE_SIDEBAND_FINDING, attributes, events);
}
