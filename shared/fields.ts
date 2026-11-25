// Small readers for request bodies. Each one records a Spanish message in `errors` when the value is wrong.

export type Body = Record<string, unknown>;
export type Errors = Record<string, string>;

export function asBody(input: unknown): Body {
  return (typeof input === 'object' && input !== null && !Array.isArray(input) ? input : {}) as Body;
}

/** `null`, `undefined` and `''` all mean "not given". */
export function isMissing(value: unknown): boolean {
  return value == null || value === '';
}

export function readText(body: Body, errors: Errors, key: string, max: number, required: boolean): string {
  const raw = body[key];
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (required && !value) errors[key] = 'Completá este dato.';
  else if (value.length > max) errors[key] = `Máximo ${max} caracteres.`;
  return value;
}

/**
 * Read a whole number that is at least `min`. A missing value takes `fallback`; with no fallback it is
 * an error. Returns null when the value is wrong, after recording `message`.
 */
export function readInteger(body: Body, errors: Errors, key: string, min: number, message: string, fallback?: number): number | null {
  const raw = body[key];
  if (isMissing(raw) && fallback !== undefined) return fallback;
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= min) return raw;
  errors[key] = message;
  return null;
}
