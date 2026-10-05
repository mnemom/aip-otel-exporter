/**
 * Fail-closed value filter for the typed AIP/AAP/CLPI recorders.
 *
 * The typed recorders export identifiers and operational data only: ids,
 * verdicts, enums, severities, categories, counts, durations, tool and model
 * names. Free text that can quote or paraphrase customer content (concern and
 * violation descriptions, evidence, reasoning summaries, policy violation
 * reasons, reclassification reasons, drift recommendations) is never read.
 *
 * Every attribute a recorder emits is named in that recorder; no input object
 * is spread into an attribute map. This filter is the second guard: a named
 * field whose value is not a string, number or boolean (an object, an array,
 * an Error, a function) is dropped instead of being expanded or stringified.
 * Used for both the Workers (OTLP JSON) and the Node SDK recorders.
 */

export type ScalarAttributeValue = string | number | boolean;

/** Copy `attrs`, keeping only string / number / boolean values. */
export function scalarAttributes(
  attrs: Record<string, unknown>,
): Record<string, ScalarAttributeValue> {
  const out: Record<string, ScalarAttributeValue> = {};
  for (const [key, value] of Object.entries(attrs)) {
    const t = typeof value;
    if (t === "string" || t === "number" || t === "boolean") {
      out[key] = value as ScalarAttributeValue;
    }
  }
  return out;
}
