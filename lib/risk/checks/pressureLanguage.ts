import { z } from "zod";
import type { VisionProvider } from "@/lib/extract/provider";
import type { RiskBill, RiskFlag } from "../types";

export const PressureSchema = z.object({
  urgency: z
    .boolean()
    .describe("true if the text pressures the reader to pay fast (today, immediately, final notice) or threatens consequences"),
  changedPaymentDetails: z
    .boolean()
    .describe("true if the text says bank, PayPal or payment details are new, changed or updated, or asks to pay a different account"),
  quotes: z.array(z.string()).describe("the exact phrases from the text that show this; empty if none"),
});
export type PressureResult = z.infer<typeof PressureSchema>;

export const pressureInstructions = (text: string) => `You review payment instructions printed on a supplier bill for signs of invoice fraud.
Answer with JSON matching the schema. Only report what the text actually says, and quote it exactly.
Normal payment terms such as "Net 30" or "due on receipt" are not pressure.
Payment instructions:
"""
${text}
"""`;

/** Used only when the model call fails, so an outage cannot hide a scam. */
const URGENT = /\b(urgent(ly)?|immediately|today|within 24 hours|asap|final notice|right away|without delay)\b/i;
const CHANGED =
  /\b(new|changed|updated|different)\s+(bank|account|paypal|payment|email|details)\b|\b(bank|account|payment|paypal)\s+(details\s+)?(has|have)\s+changed\b/i;

export function keywordPressure(text: string): PressureResult {
  const u = URGENT.exec(text)?.[0];
  const c = CHANGED.exec(text)?.[0];
  return { urgency: !!u, changedPaymentDetails: !!c, quotes: [u, c].filter((q): q is string => !!q) };
}

/**
 * One model call that looks for urgency and changed payment details in the
 * payment instructions. If the call fails or returns bad JSON, a keyword scan
 * stands in, so a failure can add a flag but never hide one.
 */
export async function checkPressureLanguage(bill: RiskBill, provider: VisionProvider): Promise<RiskFlag | null> {
  const text = bill.paymentInstructions?.trim();
  if (!text) return null;

  let result: PressureResult;
  let source: "model" | "keywords" = "model";
  try {
    const raw = await provider.generateJson({ instructions: pressureInstructions(text), schema: PressureSchema });
    result = PressureSchema.parse(JSON.parse(raw));
  } catch {
    result = keywordPressure(text);
    source = "keywords";
  }
  if (!result.urgency && !result.changedPaymentDetails) return null;

  const what = [result.urgency && "push for immediate payment", result.changedPaymentDetails && "say the payment details changed"]
    .filter(Boolean)
    .join(" and ");
  const quotes = result.quotes.map((q) => q.trim()).filter(Boolean).slice(0, 3);
  const quoted = quotes.length ? `: ${quotes.map((q) => `"${q}"`).join(", ")}` : "";
  return {
    check: "pressure_language",
    severity: "medium",
    reason: `The payment instructions ${what}${quoted}.`,
    evidence: {
      urgency: result.urgency,
      changedPaymentDetails: result.changedPaymentDetails,
      quotes,
      source,
      model: source === "model" ? provider.model : null,
    },
  };
}
