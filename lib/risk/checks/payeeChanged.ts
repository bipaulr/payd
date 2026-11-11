import type { RiskBill, RiskFlag, VendorHistory } from "../types";
import { normEmail, plural } from "../format";

/**
 * The PayPal email on the bill differs from the email this vendor was paid at
 * before. With no past payouts, the email on the vendor record is the
 * reference. Always high severity.
 */
export function checkPayeeChanged(bill: RiskBill, history: VendorHistory): RiskFlag | null {
  const email = normEmail(bill.payeeEmail);
  if (!email || !history.vendor) return null;
  const vendor = history.vendor.name;

  const paid = history.pastPayouts.filter((p) => p.billId !== bill.id && normEmail(p.payeeEmail));
  if (paid.length > 0) {
    const counts = new Map<string, number>();
    for (const p of paid) counts.set(normEmail(p.payeeEmail), (counts.get(normEmail(p.payeeEmail)) ?? 0) + 1);
    if (counts.has(email)) return null;
    const where = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([e]) => e).join(", ");
    return {
      check: "payee_changed",
      severity: "high",
      reason: `Past ${plural(paid.length, "payment")} to ${vendor} went to ${where}. This bill asks for ${email}.`,
      evidence: { billEmail: email, pastEmails: Object.fromEntries(counts), pastPayments: paid.length },
    };
  }

  const onFile = normEmail(history.vendor.paypalEmail);
  if (!onFile || onFile === email) return null;
  return {
    check: "payee_changed",
    severity: "high",
    reason: `${vendor} has no past payments in payD, and its email on file is ${onFile}. This bill asks for ${email}.`,
    evidence: { billEmail: email, vendorEmailOnFile: onFile, pastPayments: 0 },
  };
}
