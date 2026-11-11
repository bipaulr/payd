import { BillExtractionSchema, BillExtractionWireSchema, lowConfidenceFields, type BillExtraction, type ExtractionField } from "./schema";
import type { BillFile, VisionProvider } from "./provider";
import { geminiProvider } from "./gemini";

export * from "./schema";
export type { BillFile, VisionProvider } from "./provider";

export const INSTRUCTIONS = `You are a careful accounts-payable clerk. Read the attached bill and return JSON matching the schema.
Rules:
- Copy values exactly as printed. Never invent a value: if a field is not on the bill, use null with confidence 1.
- Money values are decimal strings with no currency symbol and no thousands separator, e.g. "1234.50".
- Dates are YYYY-MM-DD.
- vendorPaypalEmail is only an email address printed on the bill for payment; otherwise null.
- confidence is 0 to 1 for each field: lower it when text is blurry, ambiguous or inferred.`;

export type ExtractResult =
  | { ok: true; data: BillExtraction; lowConfidence: ExtractionField[]; model: string; raw: string; attempts: number }
  | { ok: false; error: string; model: string; raw: string; attempts: number };

export function validateExtraction(raw: string): { ok: true; data: BillExtraction } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    return { ok: false, error: `Output was not valid JSON: ${(e as Error).message}` };
  }
  const parsed = BillExtractionSchema.safeParse(json);
  if (parsed.success) return { ok: true, data: parsed.data };
  const msg = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
  return { ok: false, error: msg };
}

/**
 * Extract a bill with the vision model. On validation failure it retries once
 * with the error message; a second failure returns ok:false with the raw output
 * so the caller can mark the bill needs_review.
 */
export async function extractBill(file: BillFile, provider: VisionProvider = geminiProvider()): Promise<ExtractResult> {
  const schema = BillExtractionWireSchema;
  let raw = await provider.generateJson({ file, instructions: INSTRUCTIONS, schema });
  let v = validateExtraction(raw);
  if (v.ok) return { ok: true, data: v.data, lowConfidence: lowConfidenceFields(v.data), model: provider.model, raw, attempts: 1 };

  raw = await provider.generateJson({
    file,
    instructions: `${INSTRUCTIONS}\n\nYour previous answer failed validation. Fix these errors and answer again:\n${v.error}`,
    schema,
  });
  v = validateExtraction(raw);
  if (v.ok) return { ok: true, data: v.data, lowConfidence: lowConfidenceFields(v.data), model: provider.model, raw, attempts: 2 };
  return { ok: false, error: v.error, model: provider.model, raw, attempts: 2 };
}
