/** Money helpers. Money is always integer cents; no floats. */

/** 1234 -> "12.34" */
export function centsToValue(cents: number): string {
  if (!Number.isSafeInteger(cents)) throw new Error(`cents must be an integer, got ${cents}`);
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  return `${sign}${whole}.${frac}`;
}

/** "12.34" | "12.3" | "12" | "1,234.50" -> integer cents, using string math only. */
export function valueToCents(value: string): number {
  const s = value.trim().replace(/,/g, "");
  const m = /^(-)?(\d+)(?:\.(\d{0,2}))?$/.exec(s);
  if (!m) throw new Error(`not a money value: ${JSON.stringify(value)}`);
  const [, neg, whole, frac = ""] = m;
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) throw new Error(`money value too large: ${value}`);
  return neg ? -cents : cents;
}
