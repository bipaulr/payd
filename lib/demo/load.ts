import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Prisma, type Vendor } from "@prisma/client";
import { db } from "@/lib/db";
import { BillExtractionSchema } from "@/lib/extract";
import { ingestUpload, sha256Hex, storeExtraction } from "@/lib/bills/ingest";
import { normalizeVendorName } from "@/lib/bills/normalize";
import { runRiskEngine } from "@/lib/bills/risk";
import { senderBatchIdFor, senderItemIdFor } from "@/lib/paypal/payouts";
import { NO_FLAGS_SUMMARY } from "@/lib/risk";
import { DEMO_BILLS, DEMO_VENDORS, demoVendor, historyDates, historyInvoiceNumber, historyLines, type DemoVendor } from "./data";
import { billFacts, renderBillPdf, type BillDoc } from "./pdf";

export const DEMO_DIR = path.resolve(process.cwd(), "samples", "demo");
const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** Sandbox account that receives this vendor's payouts (docs/PLAN.md section 5.3). */
function receiverFor(v: DemoVendor): string | null {
  return process.env[`DEMO_VENDOR_EMAIL_${v.receiverSlot}`] || process.env.PAYOUT_SMOKE_EMAIL || null;
}

/** Delete all business data. WebhookEvent and ExtractionCache are kept (DECISIONS P0). */
export async function resetDemo(): Promise<void> {
  await db.$transaction([
    db.activityLog.deleteMany(),
    db.riskFlag.deleteMany(),
    db.billLineItem.deleteMany(),
    db.payout.deleteMany(),
    db.approval.deleteMany(),
    db.bill.deleteMany(),
    db.invoice.deleteMany(),
    db.vendor.deleteMany(),
  ]);
}

/** One paid bill of sample history, with its approval, payout row and timeline. */
async function createHistoryBill(vendor: Vendor, v: DemoVendor, vendorIndex: number, n: number) {
  const { issue, due, paid } = historyDates(n, v.historyCount, vendorIndex);
  const doc: BillDoc = { vendor: v, invoiceNumber: historyInvoiceNumber(v, n), issueDate: ymd(issue), dueDate: ymd(due), lines: historyLines(v, n) };
  const bytes = await renderBillPdf(doc);
  const facts = billFacts(doc);
  const received = new Date(issue.getTime() + 86_400_000);
  const approvedAt = new Date(paid.getTime() - 3_600_000);

  const bill = await db.bill.create({
    data: {
      vendorId: vendor.id,
      status: "paid",
      fileName: `${v.key}-${doc.invoiceNumber}.pdf`,
      mimeType: "application/pdf",
      fileBytes: Buffer.from(bytes),
      fileSha256: sha256Hex(bytes),
      invoiceNumber: doc.invoiceNumber,
      issueDate: issue,
      dueDate: due,
      subtotalCents: facts.subtotalCents,
      taxCents: facts.taxCents,
      totalCents: facts.totalCents,
      payeeEmail: v.paypalEmail,
      paymentInstructions: v.terms,
      extraction: { model: "sample-history", flaggedFields: [] },
      riskLevel: "low",
      riskSummary: NO_FLAGS_SUMMARY,
      category: v.category,
      paidAt: paid,
      isDemo: true,
      createdAt: received,
      lineItems: {
        create: doc.lines.map((l, position) => ({
          position,
          description: l.description,
          quantity: new Prisma.Decimal(l.quantity),
          unitPriceCents: l.unitPriceCents,
          amountCents: facts.amounts[position],
        })),
      },
      approvals: {
        create: {
          decision: "approved",
          actorName: "Sample history",
          amountCents: facts.totalCents,
          payeeEmail: v.paypalEmail,
          receiverEmail: vendor.sandboxReceiverEmail ?? "sample@history.example",
          riskLevel: "low",
          createdAt: approvedAt,
        },
      },
      activity: {
        create: [
          { actor: "system", action: "sample_history", detail: { note: "Sample data loaded by the demo. This payment was not sent to PayPal." }, createdAt: received },
          { actor: "user", action: "approved", detail: { actorName: "Sample history", riskLevel: "low" }, createdAt: approvedAt },
          { actor: "system", action: "status_paid", detail: { sample: true }, createdAt: paid },
        ],
      },
    },
    include: { approvals: true },
  });
  await db.payout.create({
    data: {
      billId: bill.id,
      approvalId: bill.approvals[0].id,
      senderBatchId: senderBatchIdFor(bill.id),
      senderItemId: senderItemIdFor(bill.id),
      // Not a PayPal id: sample history never touched PayPal, and the label says so.
      payoutBatchId: `SAMPLE-${v.key.slice(0, 4).toUpperCase()}-${String(n).padStart(2, "0")}`,
      batchStatus: "SUCCESS",
      itemStatus: "SUCCESS",
      amountCents: facts.totalCents,
      payeeEmail: v.paypalEmail,
      receiverEmail: vendor.sandboxReceiverEmail ?? "sample@history.example",
      createdAt: approvedAt,
    },
  });
}

/** Put the pre-extracted result for a demo file into ExtractionCache, if the repo has one for these exact bytes. */
async function seedCache(file: string, sha256: string): Promise<void> {
  const p = path.join(DEMO_DIR, `${file}.extraction.json`);
  if (!existsSync(p)) return;
  try {
    const stored = JSON.parse(readFileSync(p, "utf8")) as { sha256?: string; model?: string; data?: unknown; raw?: string };
    if (stored.sha256 !== sha256) return;
    const parsed = BillExtractionSchema.safeParse(stored.data);
    if (parsed.success) await storeExtraction(sha256, stored.model ?? "unknown", parsed.data, stored.raw ?? JSON.stringify(stored.data));
  } catch {
    // No usable pre-extraction: the bill is extracted live instead.
  }
}

export interface DemoOutcome {
  billId: string;
  file: string;
  kind: "clean" | "duplicate" | "fake";
  vendor: string | null;
  status: string;
  riskLevel: string | null;
  totalCents: number | null;
  flags: { check: string; severity: string; reason: string }[];
}

export interface DemoLoadResult {
  vendors: number;
  historyBills: number;
  bills: DemoOutcome[];
}

let running: Promise<DemoLoadResult> | null = null;

/**
 * "Load sample data": reset, create five invented vendors with paid history,
 * then put five new bills in the inbox (three clean, one duplicate, one fake).
 * Extraction comes from the cache seeded from samples/demo, so no model call
 * is needed; the rule checks run at once and the model-written wording for the
 * flagged bills is filled in afterwards in the background.
 */
export function loadDemo(): Promise<DemoLoadResult> {
  running ??= doLoad().finally(() => {
    running = null;
  });
  return running;
}

async function doLoad(): Promise<DemoLoadResult> {
  await resetDemo();

  let historyBills = 0;
  for (const [i, v] of DEMO_VENDORS.entries()) {
    const vendor = await db.vendor.create({
      data: {
        name: v.name,
        normalizedName: normalizeVendorName(v.name),
        paypalEmail: v.paypalEmail,
        sandboxReceiverEmail: receiverFor(v),
        defaultCategory: v.category,
        isDemo: true,
      },
    });
    await Promise.all(Array.from({ length: v.historyCount }, (_, k) => createHistoryBill(vendor, v, i, k + 1)));
    historyBills += v.historyCount;
  }

  const bills: DemoOutcome[] = [];
  for (const d of DEMO_BILLS) {
    const file = path.join(DEMO_DIR, `${d.file}.pdf`);
    // Fall back to rendering if the file is missing, so the demo still loads.
    const bytes = existsSync(file)
      ? new Uint8Array(readFileSync(file))
      : await renderBillPdf({ ...d, vendor: demoVendor(d.vendorKey) });
    await seedCache(d.file, sha256Hex(bytes));
    const { bill } = await ingestUpload({ bytes, fileName: `${d.file}.pdf`, mimeType: "application/pdf" }, { riskProvider: null, isDemo: true });
    const full = await db.bill.findUniqueOrThrow({ where: { id: bill.id }, include: { vendor: true, riskFlags: true } });
    bills.push({
      billId: full.id,
      file: `${d.file}.pdf`,
      kind: d.kind,
      vendor: full.vendor?.name ?? full.proposedVendorName,
      status: full.status,
      riskLevel: full.riskLevel,
      totalCents: full.totalCents,
      flags: full.riskFlags.map((f) => ({ check: f.check, severity: f.severity, reason: f.reason })),
    });
  }

  // Model wording for the flagged bills, after the response. Rules already set the level.
  const flagged = bills.filter((b) => b.flags.length > 0).map((b) => b.billId);
  void (async () => {
    for (const id of flagged) {
      try {
        await runRiskEngine(id);
      } catch (err) {
        console.warn(`demo: model risk pass failed for ${id}:`, err instanceof Error ? err.message : err);
      }
    }
  })();

  return { vendors: DEMO_VENDORS.length, historyBills, bills };
}
