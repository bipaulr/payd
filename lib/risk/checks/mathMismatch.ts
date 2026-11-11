import type { RiskBill, RiskFlag } from "../types";
import { usd } from "../format";

export const TOLERANCE_CENTS = 1;

/** Line items, tax and total disagree by more than one cent. */
export function checkMathMismatch(bill: RiskBill): RiskFlag | null {
  const itemsSum = bill.lineItems.length ? bill.lineItems.reduce((s, li) => s + li.amountCents, 0) : null;
  const evidence: Record<string, unknown> = {
    lineItemsCents: itemsSum,
    subtotalCents: bill.subtotalCents,
    taxCents: bill.taxCents,
    totalCents: bill.totalCents,
  };
  const problems: string[] = [];

  if (itemsSum != null && bill.subtotalCents != null && Math.abs(itemsSum - bill.subtotalCents) > TOLERANCE_CENTS) {
    problems.push(`line items add up to ${usd(itemsSum)} but the subtotal says ${usd(bill.subtotalCents)}`);
  }
  if (bill.totalCents != null) {
    const base = bill.subtotalCents ?? itemsSum;
    if (base != null) {
      const expected = base + (bill.taxCents ?? 0);
      if (Math.abs(expected - bill.totalCents) > TOLERANCE_CENTS) {
        const label = bill.subtotalCents != null ? "subtotal" : "line items";
        const taxPart = bill.taxCents != null ? ` plus ${usd(bill.taxCents)} tax` : "";
        problems.push(`${label} ${usd(base)}${taxPart} make ${usd(expected)} but the total says ${usd(bill.totalCents)}`);
        evidence.expectedTotalCents = expected;
      }
    }
  }
  if (!problems.length) return null;
  return {
    check: "math_mismatch",
    severity: "medium",
    reason: `The numbers on this bill do not add up: ${problems.join("; and ")}.`,
    evidence,
  };
}
