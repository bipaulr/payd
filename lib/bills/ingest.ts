import { createHash } from "node:crypto";
import { Prisma, type Bill } from "@prisma/client";
import { db } from "@/lib/db";
import { valueToCents } from "@/lib/money";
import { BillExtractionSchema, extractBill, lowConfidenceFields, type BillExtraction, type ExtractResult, type VisionProvider } from "@/lib/extract";
import { transition } from "./transition";
import { matchVendor } from "./vendorMatch";
import { defaultRiskProvider, runRiskEngine } from "./risk";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const ALLOWED_MIME = ["application/pdf", "image/png", "image/jpeg", "image/webp"] as const;
export type AllowedMime = (typeof ALLOWED_MIME)[number];

/** Detect the real file type from magic bytes; the browser's type is not trusted. */
export function sniffMime(b: Uint8Array): AllowedMime | null {
  const at = (i: number, ...xs: number[]) => xs.every((x, j) => b[i + j] === x);
  if (at(0, 0x25, 0x50, 0x44, 0x46, 0x2d)) return "application/pdf"; // %PDF-
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp"; // RIFF....WEBP
  return null;
}

/** Bill without its file bytes, for JSON responses. */
export function publicBill(bill: Bill) {
  const { fileBytes, ...rest } = bill;
  return { ...rest, fileSize: fileBytes.byteLength };
}

export const sha256Hex =(b: Uint8Array) => createHash("sha256").update(b).digest("hex");

const cents = (v: string | null) => (v == null ? null : valueToCents(v));
const date = (v: string | null) => (v == null ? null : new Date(`${v}T00:00:00.000Z`));

/** Bill columns and line items from a validated extraction. Throws on unparseable money/dates. */
export function mapExtraction(x: BillExtraction) {
  const issueDate = date(x.issueDate.value);
  const dueDate = date(x.dueDate.value);
  for (const d of [issueDate, dueDate]) if (d && Number.isNaN(d.getTime())) throw new Error("invalid calendar date");
  return {
    bill: {
      invoiceNumber: x.invoiceNumber.value,
      issueDate,
      dueDate,
      currency: x.currency.value ?? "USD",
      subtotalCents: cents(x.subtotal.value),
      taxCents: cents(x.tax.value),
      totalCents: cents(x.total.value),
      payeeEmail: x.vendorPaypalEmail.value?.trim().toLowerCase() ?? null,
      paymentInstructions: x.paymentInstructions.value,
    },
    lineItems: x.lineItems.value.map((li, position) => ({
      position,
      description: li.description,
      quantity: new Prisma.Decimal(li.quantity),
      unitPriceCents: valueToCents(li.unitPrice),
      amountCents: valueToCents(li.amount),
    })),
  };
}

export interface UploadInput {
  bytes: Uint8Array;
  fileName: string;
  mimeType: AllowedMime;
}

export type UploadOutcome = { bill: Bill; duplicate: boolean };

export interface IngestOptions {
  /** Vision provider for extraction (tests); defaults to Gemini. */
  provider?: VisionProvider;
  /** Provider for the risk engine's model calls; null uses the deterministic fallbacks only. */
  riskProvider?: VisionProvider | null;
  isDemo?: boolean;
}

/** A stored extraction for this exact file, if one exists and still validates. */
export async function cachedExtraction(sha256: string): Promise<ExtractResult | null> {
  const row = await db.extractionCache.findUnique({ where: { sha256 } });
  if (!row) return null;
  const stored = row.result as { data?: unknown; raw?: unknown };
  const parsed = BillExtractionSchema.safeParse(stored.data);
  if (!parsed.success) return null;
  return { ok: true, data: parsed.data, lowConfidence: lowConfidenceFields(parsed.data), model: row.model, raw: typeof stored.raw === "string" ? stored.raw : JSON.stringify(stored.data), attempts: 0 };
}

export async function storeExtraction(sha256: string, model: string, data: BillExtraction, raw: string): Promise<void> {
  const result = { data, raw } as unknown as Prisma.InputJsonValue;
  await db.extractionCache.upsert({ where: { sha256 }, create: { sha256, model, result }, update: { model, result } });
}

/**
 * Store the upload (bytes + SHA-256), or return the existing bill for the same
 * hash. New bills are extracted immediately: success moves them to extracted
 * (then needs_review if any field is under 0.7 confidence or currency is not
 * USD) and the risk engine runs, which always ends in needs_review; a second
 * validation failure moves them to needs_review with the raw output saved.
 */
export async function ingestUpload(input: UploadInput, opts: IngestOptions = {}): Promise<UploadOutcome> {
  const { provider } = opts;
  const fileSha256 = sha256Hex(input.bytes);
  const existing = await db.bill.findUnique({ where: { fileSha256 } });
  if (existing) return { bill: existing, duplicate: true };

  let bill: Bill;
  try {
    bill = await db.$transaction(async (tx) => {
      const b = await tx.bill.create({
        data: { fileName: input.fileName, mimeType: input.mimeType, fileBytes: Buffer.from(input.bytes), fileSha256, isDemo: opts.isDemo ?? false },
      });
      await tx.activityLog.create({
        data: { billId: b.id, actor: "user", action: "uploaded", detail: { fileName: input.fileName, mimeType: input.mimeType, sha256: fileSha256, bytes: input.bytes.byteLength } },
      });
      return b;
    });
  } catch (err) {
    // Two concurrent uploads of the same file: the unique hash decides the winner.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const winner = await db.bill.findUnique({ where: { fileSha256 } });
      if (winner) return { bill: winner, duplicate: true };
    }
    throw err;
  }

  // Extraction is cached by file hash: the same file never costs a second model call.
  let result: ExtractResult;
  try {
    const cached = await cachedExtraction(fileSha256);
    result = cached ?? (await extractBill({ bytes: input.bytes, mimeType: input.mimeType, fileName: input.fileName }, provider));
    if (!cached && result.ok) await storeExtraction(fileSha256, result.model, result.data, result.raw).catch(() => undefined);
  } catch (err) {
    result = { ok: false, error: `Extraction call failed: ${(err as Error).message}`, model: provider?.model ?? process.env.VISION_MODEL ?? "unknown", raw: "", attempts: 0 };
  }
  await applyExtraction(bill.id, result);
  if (result.ok) {
    // extracted -> needs_review: the risk engine always runs right after extraction.
    try {
      await runRiskEngine(bill.id, opts.riskProvider !== undefined ? opts.riskProvider : (provider ?? defaultRiskProvider()));
    } catch (err) {
      console.error(`risk engine failed for bill ${bill.id}:`, err);
    }
  }
  return { bill: await db.bill.findUniqueOrThrow({ where: { id: bill.id } }), duplicate: false };
}

async function failExtraction(billId: string, result: { error: string; model: string; raw: string; attempts: number }) {
  await transition(billId, "uploaded", "needs_review", {
    actor: "system",
    action: "extraction_failed",
    detail: { error: result.error, model: result.model, attempts: result.attempts },
    data: { rawModelOutput: result.raw, extractionError: result.error, extraction: { model: result.model, error: result.error } },
  });
}

export async function applyExtraction(billId: string, result: ExtractResult): Promise<void> {
  if (!result.ok) return failExtraction(billId, result);

  let mapped: ReturnType<typeof mapExtraction>;
  try {
    mapped = mapExtraction(result.data);
  } catch (err) {
    return failExtraction(billId, { ...result, error: `Could not map extraction: ${(err as Error).message}` });
  }

  const x = result.data;
  const flagged: string[] = [...result.lowConfidence];
  if (mapped.bill.currency !== "USD") flagged.push("currency");
  const flaggedFields = [...new Set(flagged)];

  await db.$transaction(async (tx) => {
    const match = await matchVendor(x.vendorName.value, x.vendorPaypalEmail.value, tx);
    const vendorData =
      match.kind === "matched"
        ? { vendorId: match.vendor.id, category: match.vendor.defaultCategory }
        : match.kind === "proposed"
          ? { proposedVendorName: match.name, proposedVendorEmail: match.email }
          : {};
    const extraction = {
      model: result.model,
      attempts: result.attempts,
      fields: x,
      confidence: Object.fromEntries(Object.entries(x).map(([k, f]) => [k, f.confidence])),
      flaggedFields,
      vendorMatch: match.kind === "matched" ? { kind: "matched", by: match.by, vendorId: match.vendor.id } : { kind: match.kind },
    } as Prisma.InputJsonValue;

    const moved = await transition(billId, "uploaded", "extracted", {
      tx,
      actor: "system",
      action: "extracted",
      detail: { model: result.model, attempts: result.attempts, cached: result.attempts === 0, flaggedFields, vendorMatch: match.kind },
      data: { ...mapped.bill, ...vendorData, extraction, rawModelOutput: result.raw, extractionError: null },
    });
    if (!moved) return;
    await tx.billLineItem.createMany({ data: mapped.lineItems.map((li) => ({ ...li, billId })) });
    if (flaggedFields.length > 0) {
      await transition(billId, "extracted", "needs_review", { tx, actor: "system", action: "flagged", detail: { reason: "low_confidence", fields: flaggedFields } });
    }
  });
}
