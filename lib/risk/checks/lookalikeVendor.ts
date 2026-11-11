import type { RiskBill, RiskFlag, VendorHistory } from "../types";
import { editDistance } from "../editDistance";
import { normEmail } from "../format";
import { normalizeVendorName } from "@/lib/bills/normalize";

export const MAX_DISTANCE = 2;
/** Names or emails shorter than this are too short for edit distance to mean anything. */
export const MIN_LENGTH = 5;

const chars = (d: number) => `${d} ${d === 1 ? "character" : "characters"}`;

/**
 * A new vendor (not confirmed, or confirmed with no earlier bills) whose name
 * or email is within edit distance 2 of a different known vendor.
 */
export function checkLookalikeVendor(bill: RiskBill, history: VendorHistory): RiskFlag | null {
  const isNew = !history.vendor || history.pastBills.every((p) => p.id === bill.id);
  if (!isNew) return null;
  const name = bill.vendorName ? normalizeVendorName(bill.vendorName) : "";
  const emails = [...new Set([bill.payeeEmail, bill.proposedVendorEmail].map(normEmail).filter(Boolean))];

  for (const known of history.knownVendors) {
    if (history.vendor && known.id === history.vendor.id) continue;
    const knownName = normalizeVendorName(known.name);
    if (name.length >= MIN_LENGTH && knownName.length >= MIN_LENGTH && name !== knownName) {
      const d = editDistance(name, knownName);
      if (d <= MAX_DISTANCE) {
        return flag(`"${bill.vendorName}" is a new vendor, and its name is ${chars(d)} away from known vendor "${known.name}".`, {
          matchedOn: "name",
          name: bill.vendorName,
          knownVendorId: known.id,
          knownName: known.name,
          distance: d,
        });
      }
    }
    const knownEmail = normEmail(known.paypalEmail);
    for (const email of emails) {
      if (email.length < MIN_LENGTH || knownEmail.length < MIN_LENGTH || email === knownEmail) continue;
      const d = editDistance(email, knownEmail);
      if (d <= MAX_DISTANCE) {
        return flag(`${email} is a new payee, ${chars(d)} away from ${knownEmail}, the email of known vendor "${known.name}".`, {
          matchedOn: "email",
          email,
          knownVendorId: known.id,
          knownEmail,
          distance: d,
        });
      }
    }
  }
  return null;
}

const flag = (reason: string, evidence: Record<string, unknown>): RiskFlag => ({
  check: "lookalike_vendor",
  severity: "high",
  reason,
  evidence,
});
