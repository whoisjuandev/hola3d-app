// Helpers for turning form text into API values.

/**
 * A whole number as the owners write it ("$ 36.000", "-5"). Empty text is null. Anything else comes
 * back unchanged so the API answers with the right message for that field.
 */
export function parseWhole(text: string): number | string | null {
  const compact = text.replace(/[.\s$]/g, '');
  if (!compact) return null;
  return /^-?\d+$/.test(compact) ? Number(compact) : text;
}

/** The entries of `values` that differ from `initial`. Used to send only what the owner edited. */
export function changedValues(values: Record<string, string>, initial: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(values).filter(([key, value]) => value !== initial[key]));
}
