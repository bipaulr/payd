import { z } from "zod";

/** Fields under this confidence are flagged for human review (P3). */
export const LOW_CONFIDENCE = 0.7;

const confidence = z.number().min(0).max(1).describe("0 to 1: how sure you are this value is correct as printed");
const MONEY = /^-?\d+(\.\d{1,2})?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const QTY = /^-?\d+(\.\d{1,4})?$/;

/**
 * Two flavours of the same shape: `wire` is sent to the model (plain types and
 * descriptions only, so any provider's JSON-schema subset accepts it) and
 * `strict` is what we validate against (formats, ranges).
 */
function build(strict: boolean) {
  const s = (re: RegExp | undefined, desc: string) =>
    (strict && re ? z.string().regex(re, desc) : z.string()).describe(desc);
  const field = <T extends z.ZodType>(value: T) => z.object({ value: value.nullable(), confidence });
  return z.object({
    vendorName: field(s(undefined, "Name of the business that issued the bill")),
    vendorPaypalEmail: field(
      (strict ? z.email() : z.string()).describe("PayPal or payment email printed on the bill; null if none is printed"),
    ),
    invoiceNumber: field(s(undefined, "Invoice or bill number exactly as printed")),
    issueDate: field(s(DATE, "Issue date as YYYY-MM-DD")),
    dueDate: field(s(DATE, "Due date as YYYY-MM-DD")),
    currency: field(s(/^[A-Z]{3}$/, "ISO 4217 currency code, e.g. USD")),
    lineItems: z.object({
      value: z.array(
        z.object({
          description: z.string(),
          quantity: s(QTY, "Quantity as a decimal string, e.g. 2 or 1.5"),
          unitPrice: s(MONEY, "Unit price as a decimal string without currency symbols or thousands separators, e.g. 1234.50"),
          amount: s(MONEY, "Line total as a decimal string, e.g. 1234.50"),
        }),
      ),
      confidence,
    }),
    subtotal: field(s(MONEY, "Subtotal as a decimal string, e.g. 1234.50")),
    tax: field(s(MONEY, "Tax as a decimal string, e.g. 12.34; 0 if the bill shows no tax")),
    total: field(s(MONEY, "Amount due as a decimal string, e.g. 1246.84")),
    paymentInstructions: field(s(undefined, "Payment instructions text exactly as printed")),
  });
}

export const BillExtractionWireSchema = build(false);
export const BillExtractionSchema = build(true);
export type BillExtraction = z.infer<typeof BillExtractionSchema>;
export type ExtractionField = keyof BillExtraction;
export const EXTRACTION_FIELDS = Object.keys(BillExtractionSchema.shape) as ExtractionField[];

/** Names of fields whose confidence is under LOW_CONFIDENCE. */
export function lowConfidenceFields(x: BillExtraction): ExtractionField[] {
  return EXTRACTION_FIELDS.filter((k) => x[k].confidence < LOW_CONFIDENCE);
}
