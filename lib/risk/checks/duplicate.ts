import type { RiskBill, RiskFlag, VendorHistory } from "../types";
import { normInvoice, sameDay, usd, ymd } from "../format";

/**
 * Same vendor and invoice number, or same vendor, total and issue date.
 * The file hash is ignored on purpose: a re-scanned or re-saved copy of the
 * same bill has a different hash and must still be caught.
 */
export function checkDuplicate(bill: RiskBill, history: VendorHistory): RiskFlag | null {
  const others = history.pastBills.filter((p) => p.id !== bill.id && p.status !== "rejected");
  const inv = normInvoice(bill.invoiceNumber);
  const byNumber = inv ? others.find((p) => normInvoice(p.invoiceNumber) === inv) : undefined;
  const byAmountDate =
    bill.totalCents != null && bill.issueDate
      ? others.find((p) => p.totalCents === bill.totalCents && sameDay(p.issueDate, bill.issueDate))
      : undefined;
  const match = byNumber ?? byAmountDate;
  if (!match) return null;

  const vendor = bill.vendorName ?? "this vendor";
  const reason = byNumber
    ? `Invoice ${bill.invoiceNumber} from ${vendor} was already received on ${ymd(match.createdAt)} (that bill is ${match.status}).`
    : `A bill from ${vendor} for ${usd(bill.totalCents as number)} dated ${ymd(bill.issueDate as Date)} was already received on ${ymd(match.createdAt)} (that bill is ${match.status}).`;
  return {
    check: "duplicate",
    severity: "high",
    reason,
    evidence: {
      matchedBillId: match.id,
      matchedOn: byNumber ? "invoice_number" : "total_and_issue_date",
      invoiceNumber: match.invoiceNumber,
      totalCents: match.totalCents,
      issueDate: match.issueDate ? ymd(match.issueDate) : null,
      matchedStatus: match.status,
      sameFile: match.fileSha256 === bill.fileSha256,
    },
  };
}
