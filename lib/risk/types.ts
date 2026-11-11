import type { RiskCheck, RiskLevel } from "@prisma/client";

export type { RiskCheck, RiskLevel };

/** The bill fields the risk engine reads. Money is integer cents. */
export interface RiskBill {
  id: string;
  vendorId: string | null;
  /** Confirmed vendor name, else the proposed (extracted) name. */
  vendorName: string | null;
  /** Proposed vendor email when no vendor is confirmed. */
  proposedVendorEmail: string | null;
  invoiceNumber: string | null;
  issueDate: Date | null;
  subtotalCents: number | null;
  taxCents: number | null;
  totalCents: number | null;
  payeeEmail: string | null;
  paymentInstructions: string | null;
  fileSha256: string;
  lineItems: { description: string; amountCents: number }[];
}

export interface PastBill {
  id: string;
  invoiceNumber: string | null;
  issueDate: Date | null;
  totalCents: number | null;
  fileSha256: string;
  status: string;
  createdAt: Date;
}

export interface PastPayout {
  billId: string;
  /** Payee email printed on the paid bill (document email, not the sandbox receiver). */
  payeeEmail: string | null;
}

export interface KnownVendor {
  id: string;
  name: string;
  paypalEmail: string;
}

/** Everything the checks know about the bill's vendor and the vendor list. */
export interface VendorHistory {
  /** The bill's confirmed vendor, null when only proposed. */
  vendor: KnownVendor | null;
  /** Other bills from the same vendor (the bill itself is ignored if present). */
  pastBills: PastBill[];
  /** Completed (paid) payouts to this vendor. */
  pastPayouts: PastPayout[];
  /** Every vendor on file, used by lookalike_vendor. */
  knownVendors: KnownVendor[];
}

export interface RiskFlag {
  check: RiskCheck;
  severity: RiskLevel;
  /** Plain language, names the evidence. */
  reason: string;
  evidence: Record<string, unknown>;
}

export const SEVERITY_RANK: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2 };

export const emptyHistory = (): VendorHistory => ({ vendor: null, pastBills: [], pastPayouts: [], knownVendors: [] });
