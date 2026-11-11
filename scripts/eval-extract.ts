/**
 * Runs extractBill() on every file in samples/ that has a matching
 * <name>.json of expected values and prints per-field accuracy.
 * Run: npx tsx scripts/eval-extract.ts   (needs GEMINI_API_KEY, VISION_MODEL)
 */
import "dotenv/config";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { extractBill, EXTRACTION_FIELDS, type BillExtraction, type ExtractionField } from "@/lib/extract";
import { sniffMime } from "@/lib/bills/ingest";
import { compareField } from "@/lib/extract/compare";

const dir = path.resolve(process.cwd(), "samples");
const files = existsSync(dir) ? readdirSync(dir).filter((f) => /\.(pdf|png|jpe?g|webp)$/i.test(f)).sort() : [];

async function main() {
  if (files.length === 0) {
    console.error("samples/ has no bills. Run: npx tsx scripts/make-samples.ts");
    process.exit(1);
  }
  const hits = Object.fromEntries(EXTRACTION_FIELDS.map((f) => [f, 0])) as Record<ExtractionField, number>;
  let scored = 0;
  let failures = 0;

  for (const file of files) {
    const expPath = path.join(dir, file.replace(/\.[^.]+$/, ".json"));
    if (!existsSync(expPath)) {
      console.log(`skip ${file}: no expected JSON`);
      continue;
    }
    const expected = JSON.parse(readFileSync(expPath, "utf8")) as Record<string, unknown>;
    const bytes = new Uint8Array(readFileSync(path.join(dir, file)));
    const mimeType = sniffMime(bytes);
    if (!mimeType) {
      console.log(`skip ${file}: unsupported file type`);
      continue;
    }
    scored++;
    const t0 = Date.now();
    const res = await extractBill({ bytes, mimeType, fileName: file });
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    if (!res.ok) {
      failures++;
      console.log(`\n${file}  FAILED after ${res.attempts} attempts (${secs}s): ${res.error}`);
      continue;
    }
    const got: BillExtraction = res.data;
    console.log(`\n${file}  model=${res.model} attempts=${res.attempts} ${secs}s  low-confidence: ${res.lowConfidence.join(", ") || "none"}`);
    for (const f of EXTRACTION_FIELDS) {
      const ok = compareField(f, got[f].value, expected[f]);
      if (ok) hits[f]++;
      const show = (v: unknown) => (f === "lineItems" ? `${Array.isArray(v) ? v.length : 0} items` : JSON.stringify(v));
      console.log(`  ${ok ? "PASS" : "FAIL"}  ${f.padEnd(20)} conf=${got[f].confidence.toFixed(2)}  got=${show(got[f].value)}${ok ? "" : `  expected=${show(expected[f])}`}`);
    }
  }

  console.log(`\nPer-field accuracy over ${scored} bills (${failures} failed extraction):`);
  let total = 0;
  for (const f of EXTRACTION_FIELDS) {
    total += hits[f];
    console.log(`  ${f.padEnd(20)} ${hits[f]}/${scored}  ${scored ? ((100 * hits[f]) / scored).toFixed(0) : 0}%`);
  }
  const denom = scored * EXTRACTION_FIELDS.length;
  console.log(`  ${"OVERALL".padEnd(20)} ${total}/${denom}  ${denom ? ((100 * total) / denom).toFixed(1) : 0}%`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
