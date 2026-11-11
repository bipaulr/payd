import { valueToCents } from "@/lib/money";
import type { ExtractionField } from "./schema";

const MONEY_FIELDS = new Set<ExtractionField>(["subtotal", "tax", "total"]);
const norm = (s: string) => s.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();

function money(a: unknown, b: unknown): boolean {
  if (a == null || b == null) return a == b;
  try {
    return valueToCents(String(a)) === valueToCents(String(b));
  } catch {
    return false;
  }
}

const qty = (a: unknown, b: unknown) => a != null && b != null && Number(a) === Number(b);

/** True when an extracted value matches the expected one (eval-extract). */
export function compareField(field: ExtractionField, got: unknown, expected: unknown): boolean {
  if (expected === undefined) return true;
  if (MONEY_FIELDS.has(field)) return money(got, expected);
  if (field === "lineItems") {
    if (!Array.isArray(got) || !Array.isArray(expected) || got.length !== expected.length) return false;
    return expected.every((e, i) => {
      const g = got[i] as Record<string, unknown>;
      return norm(String(g.description)) === norm(String(e.description)) && qty(g.quantity, e.quantity) && money(g.unitPrice, e.unitPrice) && money(g.amount, e.amount);
    });
  }
  if (got == null || expected == null) return got == expected;
  return norm(String(got)) === norm(String(expected));
}
