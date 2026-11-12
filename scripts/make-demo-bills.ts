/**
 * Writes the five demo bills to samples/demo as PDFs, plus for each:
 *   <name>.json             the values printed on the bill (for checking)
 *   <name>.extraction.json  the real model extraction, cached by file hash
 * All vendors are invented. Run: npm run demo:bills   (add --no-extract to skip the model)
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { extractBill, EXTRACTION_FIELDS } from "@/lib/extract";
import { compareField } from "@/lib/extract/compare";
import { sha256Hex } from "@/lib/bills/ingest";
import { centsToValue } from "@/lib/money";
import { DEMO_BILLS, demoVendor } from "@/lib/demo/data";
import { billFacts, renderBillPdf } from "@/lib/demo/pdf";

async function main() {
  const dir = path.resolve(process.cwd(), "samples", "demo");
  mkdirSync(dir, { recursive: true });
  const extract = !process.argv.includes("--no-extract");
  let misses = 0;

  for (const d of DEMO_BILLS) {
    const vendor = demoVendor(d.vendorKey);
    const doc = { ...d, vendor };
    const bytes = await renderBillPdf(doc);
    const facts = billFacts(doc);
    const expected = {
      kind: d.kind,
      vendorName: vendor.name,
      vendorPaypalEmail: facts.payeeEmail,
      invoiceNumber: d.invoiceNumber,
      issueDate: d.issueDate,
      dueDate: d.dueDate,
      currency: "USD",
      lineItems: d.lines.map((l, i) => ({ description: l.description, quantity: l.quantity, unitPrice: centsToValue(l.unitPriceCents), amount: centsToValue(facts.amounts[i]) })),
      subtotal: centsToValue(facts.subtotalCents),
      tax: centsToValue(facts.taxCents),
      total: centsToValue(facts.totalCents),
      paymentInstructions: facts.paymentInstructions,
    };
    writeFileSync(path.join(dir, `${d.file}.pdf`), bytes);
    writeFileSync(path.join(dir, `${d.file}.json`), JSON.stringify(expected, null, 2) + "\n");
    const sha256 = sha256Hex(bytes);
    console.log(`wrote samples/demo/${d.file}.pdf (${bytes.byteLength} bytes, ${d.kind}, total ${expected.total})`);
    if (!extract) continue;

    const res = await extractBill({ bytes, mimeType: "application/pdf", fileName: `${d.file}.pdf` });
    if (!res.ok) {
      console.error(`  extraction FAILED: ${res.error}`);
      misses++;
      continue;
    }
    const wrong = EXTRACTION_FIELDS.filter((f) => !compareField(f, res.data[f].value, (expected as Record<string, unknown>)[f]));
    if (wrong.length) misses++;
    console.log(`  extracted with ${res.model}: ${wrong.length ? `MISMATCH in ${wrong.join(", ")}` : "all fields match"}`);
    writeFileSync(path.join(dir, `${d.file}.extraction.json`), JSON.stringify({ sha256, model: res.model, data: res.data, raw: res.raw }, null, 2) + "\n");
  }
  if (misses) {
    console.error(`${misses} bill(s) did not extract cleanly; check before using the demo.`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
