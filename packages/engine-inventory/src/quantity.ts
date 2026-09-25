/**
 * Quantities are exact decimals with three places (numeric(18,3) in the database). In code they
 * travel as strings and are compared and added as whole thousandths, never as floating point.
 */
export const QUANTITY_PATTERN = '^(0|[1-9][0-9]{0,14})(\\.[0-9]{1,3})?$';
const re = new RegExp(QUANTITY_PATTERN);

export function isQuantity(value: string): boolean {
  return re.test(value);
}

/** "12.5" → 12500n thousandths. Accepts the database's own rendering ("12.500", "-3.000"). */
export function toMilli(value: string | number): bigint {
  const s = String(value).trim();
  const negative = s.startsWith('-');
  const [whole = '0', frac = ''] = (negative ? s.slice(1) : s).split('.');
  const milli = BigInt(whole) * 1000n + BigInt((frac + '000').slice(0, 3));
  return negative ? -milli : milli;
}

/** 12500n → "12.5"; trailing zeros are dropped for display. */
export function fromMilli(milli: bigint): string {
  const negative = milli < 0n;
  const abs = negative ? -milli : milli;
  const whole = abs / 1000n;
  const frac = (abs % 1000n).toString().padStart(3, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}${frac ? `.${frac}` : ''}`;
}

export const normalizeQuantity = (value: string | number): string => fromMilli(toMilli(value));
