import { ConflictError, ValidationError } from '@factory/platform-core';

export const uuidPattern = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
export const DATE_PATTERN = '^[0-9]{4}-[0-9]{2}-[0-9]{2}$';
export const text = (max: number) => ({ type: 'string', minLength: 1, maxLength: max });
export const optionalText = (max: number) => ({ type: ['string', 'null'], maxLength: max });
export const reasonSchema = { type: 'string', minLength: 3, maxLength: 500 };

export function assertVersion(actual: number, expected: number, what: string): void {
  if (actual !== expected) {
    throw new ConflictError('stale_version', `The ${what} was changed by someone else. Reload and try again.`, {
      expectedVersion: expected,
      currentVersion: actual,
    });
  }
}

/** A real calendar day in 'YYYY-MM-DD' form (the schema checks the shape, this checks the day exists). */
export function assertDate(value: string, field: string): void {
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) throw new ValidationError({ [field]: 'not a calendar date' });
}

/** Calendar arithmetic on 'YYYY-MM-DD' strings, in UTC so no local time zone moves the day. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function endOfMonth(date: string): string {
  const d = new Date(`${date.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

export const yearOf = (date: string) => Number(date.slice(0, 4));

/** Every changed field as [before, after], for the audit entry. */
export function diff<T extends Record<string, unknown>>(before: T, patch: Partial<T>): Record<string, readonly [unknown, unknown]> {
  const out: Record<string, readonly [unknown, unknown]> = {};
  for (const [k, v] of Object.entries(patch)) if (v !== undefined && before[k] !== v) out[k] = [before[k], v];
  return out;
}
