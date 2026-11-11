import type { RiskBill, RiskFlag, VendorHistory } from "../types";
import { plural, usd } from "../format";

export const MIN_HISTORY = 3;
export const ANOMALY_MULTIPLE = 3;

/** Twice the median, as an integer, so comparisons stay in whole cents. */
function twiceMedian(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? 2 * s[mid] : s[mid - 1] + s[mid];
}

/** Total is more than 3x the vendor's median, when the vendor has at least three past bills. */
export function checkAmountAnomaly(bill: RiskBill, history: VendorHistory): RiskFlag | null {
  if (bill.totalCents == null) return null;
  const totals = history.pastBills
    .filter((p) => p.id !== bill.id && p.status !== "rejected" && p.totalCents != null)
    .map((p) => p.totalCents as number);
  if (totals.length < MIN_HISTORY) return null;
  const twoMed = twiceMedian(totals);
  // total > 3 * (twoMed / 2)  <=>  2 * total > 3 * twoMed
  if (2 * bill.totalCents <= ANOMALY_MULTIPLE * twoMed) return null;
  const medianCents = Math.round(twoMed / 2);
  const vendor = bill.vendorName ?? "this vendor";
  return {
    check: "amount_anomaly",
    severity: "medium",
    reason: `This bill is ${usd(bill.totalCents)}, more than ${ANOMALY_MULTIPLE}x the ${usd(medianCents)} median of ${vendor}'s last ${plural(totals.length, "bill")}.`,
    evidence: { totalCents: bill.totalCents, medianCents, pastBills: totals.length, multiple: ANOMALY_MULTIPLE },
  };
}
