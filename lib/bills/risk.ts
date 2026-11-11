import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { geminiProvider } from "@/lib/extract/gemini";
import type { VisionProvider } from "@/lib/extract/provider";
import { assessBill, type RiskAssessment, type RiskBill, type VendorHistory } from "@/lib/risk";
import { normalizeVendorName } from "./normalize";
import { transition, type Tx } from "./transition";

const billInclude = { lineItems: { orderBy: { position: "asc" } }, vendor: true } as const;
type LoadedBill = Prisma.BillGetPayload<{ include: typeof billInclude }>;

export function toRiskBill(b: LoadedBill): RiskBill {
  return {
    id: b.id,
    vendorId: b.vendorId,
    vendorName: b.vendor?.name ?? b.proposedVendorName,
    proposedVendorEmail: b.proposedVendorEmail,
    invoiceNumber: b.invoiceNumber,
    issueDate: b.issueDate,
    subtotalCents: b.subtotalCents,
    taxCents: b.taxCents,
    totalCents: b.totalCents,
    payeeEmail: b.payeeEmail,
    paymentInstructions: b.paymentInstructions,
    fileSha256: b.fileSha256,
    lineItems: b.lineItems.map((li) => ({ description: li.description, amountCents: li.amountCents })),
  };
}

const pastBillSelect = { id: true, invoiceNumber: true, issueDate: true, totalCents: true, fileSha256: true, status: true, createdAt: true } as const;

/** The vendor's other bills, its paid payouts and the vendor list. */
export async function loadVendorHistory(b: LoadedBill, tx: Tx = db): Promise<VendorHistory> {
  const knownVendors = await tx.vendor.findMany({ select: { id: true, name: true, paypalEmail: true }, orderBy: { createdAt: "asc" } });
  if (b.vendorId && b.vendor) {
    const [pastBills, payouts] = await Promise.all([
      tx.bill.findMany({ where: { vendorId: b.vendorId, id: { not: b.id } }, select: pastBillSelect }),
      tx.payout.findMany({ where: { bill: { vendorId: b.vendorId, status: "paid" }, billId: { not: b.id } }, select: { billId: true, payeeEmail: true } }),
    ]);
    return {
      vendor: { id: b.vendor.id, name: b.vendor.name, paypalEmail: b.vendor.paypalEmail },
      pastBills,
      pastPayouts: payouts,
      knownVendors,
    };
  }
  // Unconfirmed vendor: other unconfirmed bills with the same normalised proposed name.
  const norm = b.proposedVendorName ? normalizeVendorName(b.proposedVendorName) : "";
  const candidates = norm
    ? await tx.bill.findMany({
        where: { vendorId: null, proposedVendorName: { not: null }, id: { not: b.id } },
        select: { ...pastBillSelect, proposedVendorName: true },
      })
    : [];
  const pastBills = candidates.filter((c) => normalizeVendorName(c.proposedVendorName ?? "") === norm);
  return { vendor: null, pastBills, pastPayouts: [], knownVendors };
}

/** Gemini when GEMINI_API_KEY is set; otherwise null and the deterministic fallbacks run. */
export function defaultRiskProvider(): VisionProvider | null {
  try {
    return geminiProvider({ timeoutMs: 20_000 });
  } catch {
    return null;
  }
}

export type RunRiskResult = { ok: true; assessment: RiskAssessment } | { ok: false; reason: "not_found" | "not_reviewable"; message: string };

/**
 * Run the risk engine on a bill and store the result: replace its RiskFlags,
 * set riskLevel and riskSummary, and move extracted -> needs_review (or stay
 * in needs_review after an edit). Only bills in extracted or needs_review are
 * assessed; the status-conditional update makes a concurrent approval win.
 */
export async function runRiskEngine(billId: string, provider: VisionProvider | null = defaultRiskProvider()): Promise<RunRiskResult> {
  const bill = await db.bill.findUnique({ where: { id: billId }, include: billInclude });
  if (!bill) return { ok: false, reason: "not_found", message: "Bill not found" };
  if (bill.status !== "extracted" && bill.status !== "needs_review") {
    return { ok: false, reason: "not_reviewable", message: `Bill is ${bill.status}; risk runs only before a decision` };
  }
  const history = await loadVendorHistory(bill);
  const assessment = await assessBill(toRiskBill(bill), history, provider);

  const stored = await db.$transaction(async (tx) => {
    const data = { riskLevel: assessment.level, riskSummary: assessment.summary };
    const detail = {
      level: assessment.level,
      checks: assessment.flags.map((f) => f.check),
      summarySource: assessment.summarySource,
    };
    let moved = await transition(billId, "extracted", "needs_review", { tx, actor: "system", action: "risk_assessed", detail, data });
    if (!moved) {
      moved = await transition(billId, "needs_review", "needs_review", { tx, actor: "system", action: "risk_assessed", detail, data });
    }
    if (!moved) return false;
    await tx.riskFlag.deleteMany({ where: { billId } });
    if (assessment.flags.length) {
      await tx.riskFlag.createMany({
        data: assessment.flags.map((f) => ({
          billId,
          check: f.check,
          severity: f.severity,
          reason: f.reason,
          evidence: f.evidence as Prisma.InputJsonValue,
        })),
      });
    }
    return true;
  });
  if (!stored) return { ok: false, reason: "not_reviewable", message: "Bill left review while risk was running" };
  return { ok: true, assessment };
}
