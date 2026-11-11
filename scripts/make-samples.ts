/**
 * Writes simple test bills to samples/: <name>.pdf plus <name>.json holding
 * the expected extraction. Vendors are invented. Run: npx tsx scripts/make-samples.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { centsToValue } from "@/lib/money";

interface Line { description: string; quantity: string; unitPriceCents: number }
interface Sample {
  name: string;
  vendorName: string;
  address: string[];
  vendorPaypalEmail: string | null;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  lines: Line[];
  taxRateBps: number; // basis points
  paymentInstructions: string;
}

const SAMPLES: Sample[] = [
  {
    name: "bill-01-brightleaf",
    vendorName: "Brightleaf Office Supply",
    address: ["412 Juniper Ave", "Portland, OR 97205"],
    vendorPaypalEmail: "billing@brightleaf-supply.example",
    invoiceNumber: "BL-20417",
    issueDate: "2026-10-28",
    dueDate: "2026-11-27",
    lines: [
      { description: "Copy paper, 10 reams", quantity: "3", unitPriceCents: 4599 },
      { description: "Gel pens, box of 24", quantity: "2", unitPriceCents: 1850 },
      { description: "Desk organizer", quantity: "1", unitPriceCents: 2799 },
    ],
    taxRateBps: 0,
    paymentInstructions: "Pay via PayPal to billing@brightleaf-supply.example within 30 days.",
  },
  {
    name: "bill-02-harborline",
    vendorName: "Harborline IT Services LLC",
    address: ["88 Wharf Street, Suite 300", "Boston, MA 02110"],
    vendorPaypalEmail: "ar@harborline-it.example",
    invoiceNumber: "HIT-2026-0193",
    issueDate: "2026-11-02",
    dueDate: "2026-11-16",
    lines: [
      { description: "Managed IT support, November", quantity: "1", unitPriceCents: 125000 },
      { description: "On-site repair labor (hours)", quantity: "2.5", unitPriceCents: 9500 },
    ],
    taxRateBps: 625,
    paymentInstructions: "Net 14. Send PayPal payment to ar@harborline-it.example and reference the invoice number.",
  },
  {
    name: "bill-03-greenfork",
    vendorName: "Greenfork Catering Co.",
    address: ["7 Mill Road", "Austin, TX 78701"],
    vendorPaypalEmail: null,
    invoiceNumber: "GF-5521",
    issueDate: "2026-11-05",
    dueDate: "2026-12-05",
    lines: [
      { description: "Team lunch buffet (per person)", quantity: "18", unitPriceCents: 1675 },
      { description: "Delivery fee", quantity: "1", unitPriceCents: 3500 },
    ],
    taxRateBps: 825,
    paymentInstructions: "Please pay by check payable to Greenfork Catering Co. or by bank transfer.",
  },
];

/** quantity string * cents, string math: "2.5" * 9500 -> 23750 (rounded half up). */
function lineAmount(q: string, unit: number): number {
  const [w, f = ""] = q.split(".");
  const scale = 10 ** f.length;
  const qInt = Number(w) * scale + Number(f || "0");
  return Math.round((qInt * unit) / scale);
}

async function render(s: Sample) {
  const amounts = s.lines.map((l) => lineAmount(l.quantity, l.unitPriceCents));
  const subtotal = amounts.reduce((a, b) => a + b, 0);
  const tax = Math.round((subtotal * s.taxRateBps) / 10000);
  const total = subtotal + tax;

  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const text = (t: string, x: number, y: number, size = 11, f = font) => page.drawText(t, { x, y, size, font: f, color: rgb(0.1, 0.1, 0.1) });
  const right = (t: string, xr: number, y: number, size = 11, f = font) => text(t, xr - f.widthOfTextAtSize(t, size), y, size, f);

  let y = 740;
  text(s.vendorName, 50, y, 20, bold);
  for (const a of s.address) text(a, 50, (y -= 18));
  if (s.vendorPaypalEmail) text(`PayPal: ${s.vendorPaypalEmail}`, 50, (y -= 18));
  right("INVOICE", 562, 740, 22, bold);
  right(`Invoice #: ${s.invoiceNumber}`, 562, 712);
  right(`Issue date: ${s.issueDate}`, 562, 696);
  right(`Due date: ${s.dueDate}`, 562, 680);
  right("Currency: USD", 562, 664);

  y = 600;
  text("Bill to: Northwind Bakery, 21 Elm St, Springfield", 50, y);
  y -= 36;
  text("Description", 50, y, 11, bold);
  right("Qty", 360, y, 11, bold);
  right("Unit price", 460, y, 11, bold);
  right("Amount", 562, y, 11, bold);
  page.drawLine({ start: { x: 50, y: y - 6 }, end: { x: 562, y: y - 6 }, thickness: 1 });
  s.lines.forEach((l, i) => {
    y -= 22;
    text(l.description, 50, y);
    right(l.quantity, 360, y);
    right(`$${centsToValue(l.unitPriceCents)}`, 460, y);
    right(`$${centsToValue(amounts[i])}`, 562, y);
  });
  y -= 36;
  right("Subtotal", 460, y);
  right(`$${centsToValue(subtotal)}`, 562, y);
  right(`Tax (${(s.taxRateBps / 100).toFixed(2)}%)`, 460, (y -= 18));
  right(`$${centsToValue(tax)}`, 562, y);
  right("Total due", 460, (y -= 22), 13, bold);
  right(`$${centsToValue(total)}`, 562, y, 13, bold);
  y -= 50;
  text("Payment instructions", 50, y, 11, bold);
  text(s.paymentInstructions, 50, (y -= 16), 10);

  const expected = {
    vendorName: s.vendorName,
    vendorPaypalEmail: s.vendorPaypalEmail,
    invoiceNumber: s.invoiceNumber,
    issueDate: s.issueDate,
    dueDate: s.dueDate,
    currency: "USD",
    lineItems: s.lines.map((l, i) => ({ description: l.description, quantity: l.quantity, unitPrice: centsToValue(l.unitPriceCents), amount: centsToValue(amounts[i]) })),
    subtotal: centsToValue(subtotal),
    tax: centsToValue(tax),
    total: centsToValue(total),
    paymentInstructions: s.paymentInstructions,
  };
  return { pdf: await doc.save(), expected };
}

async function main() {
  const dir = path.resolve(process.cwd(), "samples");
  mkdirSync(dir, { recursive: true });
  for (const s of SAMPLES) {
    const { pdf, expected } = await render(s);
    writeFileSync(path.join(dir, `${s.name}.pdf`), pdf);
    writeFileSync(path.join(dir, `${s.name}.json`), JSON.stringify(expected, null, 2) + "\n");
    console.log(`wrote samples/${s.name}.pdf and .json`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
