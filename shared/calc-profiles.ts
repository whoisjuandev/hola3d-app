// Saved calculator profiles: the calculator's input under a name, to load again later. Shared by the Worker API and the
// React app.
import type { CalcInput } from './calculator';
import { asBody, readText, type Errors } from './fields';
import type { ValidationResult } from './orders';
import { readCalcInput } from './quotes';

export const MAX_PROFILE_NAME = 60;

/** The fields the owner sets. */
export interface CalcProfileFields {
  name: string; // 1 to 60 characters, unique among the profiles (ignoring case)
  input: CalcInput; // the calculator input as it was saved, printer and spool ids included
}

export interface CalcProfile extends CalcProfileFields {
  id: number;
  createdAt: string;
  updatedAt: string;
}

/** The message for a name another profile already has. */
export const DUPLICATE_PROFILE_NAME = 'Ya hay un perfil con ese nombre.';

/**
 * Validate a profile: for a new one the request, for an edit the stored profile merged with the request. The input
 * follows the rules of a quote's input, except that a printer or spool that no longer exists is fine: the calculator
 * leaves that field to choose again when it loads the profile.
 */
export function validateCalcProfile(raw: unknown): ValidationResult<CalcProfileFields> {
  const errors: Errors = {};
  const body = asBody(raw);
  const name = readText(body, errors, 'name', MAX_PROFILE_NAME, true);
  const input = readCalcInput(body.input);
  if (typeof input === 'string') errors.input = input;
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { name, input: input as CalcInput } };
}

/** A name folded as the database compares profile names (SQLite NOCASE: A to Z only), for sorting and uniqueness. */
export function profileNameKey(name: string): string {
  return name.replace(/[A-Z]/g, (c) => c.toLowerCase());
}
