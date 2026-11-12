import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { centsToValue } from "@/lib/money";
import { DEMO_BUYER, type DemoLine, type DemoVendor } from "./data";

export interface BillDoc {
  vendor: DemoVendor;
  invoiceNumber: string;
  issueDate: string; // YYYY-MM-DD
  dueDate: string;
  lines: DemoLine[];
  printedEmail?: string | null;
  paymentInstructions?: string;
  notice?: string;
  layout?: 0 | 1 | 2;
}

/** quantity string * cents with integer math: "2.5" * 9500 -> 23750 (rounded half up). */
export function lineAmount(q: string, unit: number): number {
  const [w, f = ""] = q.split(".");
  const scale = 10 ** f.length;
  const qInt = Number(w) * scale + Number(f || "0");
  return Math.round((qInt * unit) / scale);
}

export function billTotals(lines: DemoLine[], taxRateBps: number) {
  const amounts = lines.map((l) => lineAmount(l.quantity, l.unitPriceCents));
  const subtotalCents = amounts.reduce((a, b) => a + b, 0);
  const taxCents = Math.round((subtotalCents * taxRateBps) / 10000);
  return { amounts, subtotalCents, taxCents, totalCents: subtotalCents + taxCents };
}

const INK = rgb(0.1, 0.11, 0.13);
const GREY = rgb(0.42, 0.44, 0.48);
const usd = (c: number) => `$${centsToValue(c).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
const initials = (name: string) => name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > width && line) {
      out.push(line);
      line = word;
    } else line = next;
  }
  if (line) out.push(line);
  return out;
}

/**
 * Draw one bill as a US Letter PDF. Three layouts so the demo bills do not
 * all look alike: 0 classic (logo left), 1 banded header, 2 plain statement.
 * Creation dates are fixed so the same input always gives the same bytes.
 */
export async function renderBillPdf(d: BillDoc): Promise<Uint8Array> {
  const { vendor } = d;
  const layout = d.layout ?? vendor.layout;
  const email = d.printedEmail === undefined ? vendor.paypalEmail : d.printedEmail;
  const instructions = d.paymentInstructions ?? vendor.terms;
  const { amounts, subtotalCents, taxCents, totalCents } = billTotals(d.lines, vendor.taxRateBps);
  const brand = rgb(...vendor.color);

  const doc = await PDFDocument.create();
  const fixed = new Date(`${d.issueDate}T12:00:00.000Z`);
  doc.setCreationDate(fixed);
  doc.setModificationDate(fixed);
  doc.setTitle(`${vendor.name} ${d.invoiceNumber}`);
  doc.setProducer("payD demo bill generator");
  doc.setCreator("payD demo bill generator");
  const page: PDFPage = doc.addPage([612, 792]);
  const body = await doc.embedFont(layout === 2 ? StandardFonts.Courier : StandardFonts.Helvetica);
  const bold = await doc.embedFont(layout === 2 ? StandardFonts.CourierBold : StandardFonts.HelveticaBold);
  const text = (t: string, x: number, y: number, size = 10.5, f = body, color = INK) => page.drawText(t, { x, y, size, font: f, color });
  const right = (t: string, xr: number, y: number, size = 10.5, f = body, color = INK) => text(t, xr - f.widthOfTextAtSize(t, size), y, size, f, color);
  const L = 50;
  const R = 562;
  let y: number;

  const meta: [string, string][] = [
    ["Invoice number", d.invoiceNumber],
    ["Issue date", d.issueDate],
    ["Due date", d.dueDate],
    ["Currency", "USD"],
  ];

  if (layout === 0) {
    page.drawRectangle({ x: L, y: 706, width: 46, height: 46, color: brand });
    text(initials(vendor.name), L + 9, 721, 19, bold, rgb(1, 1, 1));
    text(vendor.name, L + 58, 734, 17, bold);
    text(vendor.address.join(", "), L + 58, 717, 9.5, body, GREY);
    if (email) text(`PayPal: ${email}`, L + 58, 704, 9.5, body, GREY);
    right("INVOICE", R, 734, 20, bold, brand);
    y = 672;
    for (const [k, val] of meta) {
      right(`${k}: ${val}`, R, y, 10.5);
      y -= 15;
    }
    text("Bill to", L, 672, 9, bold, GREY);
    text(DEMO_BUYER.name, L, 657);
    text(DEMO_BUYER.address, L, 643, 9.5, body, GREY);
    y = 590;
  } else if (layout === 1) {
    page.drawRectangle({ x: 0, y: 700, width: 612, height: 92, color: brand });
    page.drawCircle({ x: L + 22, y: 746, size: 22, color: rgb(1, 1, 1) });
    text(initials(vendor.name), L + 9, 739, 17, bold, brand);
    text(vendor.name, L + 58, 750, 19, bold, rgb(1, 1, 1));
    text(vendor.address.join(" | "), L + 58, 733, 9.5, body, rgb(1, 1, 1));
    right("Invoice", R, 746, 22, bold, rgb(1, 1, 1));
    y = 672;
    meta.forEach(([k, val], i) => {
      const x = L + (i % 2) * 260;
      const yy = y - Math.floor(i / 2) * 32;
      text(k.toUpperCase(), x, yy, 8, bold, GREY);
      text(val, x, yy - 13, 11.5, bold);
    });
    text("BILLED TO", L, 600, 8, bold, GREY);
    text(`${DEMO_BUYER.name}, ${DEMO_BUYER.address}`, L, 587, 10);
    if (email) {
      text("PAYPAL", L + 300, 600, 8, bold, GREY);
      text(email, L + 300, 587, 10);
    }
    y = 548;
  } else {
    right(vendor.name.toUpperCase(), R, 742, 14, bold);
    vendor.address.forEach((a, i) => right(a, R, 726 - i * 13, 9.5, body, GREY));
    if (email) right(email, R, 726 - vendor.address.length * 13, 9.5, body, GREY);
    page.drawRectangle({ x: L, y: 728, width: 30, height: 30, borderColor: brand, borderWidth: 2 });
    text(initials(vendor.name), L + 5, 738, 12, bold, brand);
    text("BILL / STATEMENT", L, 690, 13, bold);
    page.drawLine({ start: { x: L, y: 682 }, end: { x: R, y: 682 }, thickness: 0.8, color: INK });
    y = 664;
    for (const [k, val] of meta) {
      text(`${k.padEnd(16, ".")} ${val}`, L, y, 10);
      y -= 14;
    }
    text(`Customer: ${DEMO_BUYER.name}`, L, y - 6, 10);
    y -= 44;
  }

  if (d.notice) {
    page.drawRectangle({ x: L, y: y - 6, width: R - L, height: 26, color: rgb(0.8, 0.1, 0.1) });
    text(d.notice, L + 12, y + 2, 12, bold, rgb(1, 1, 1));
    y -= 40;
  }

  // Line items table
  if (layout !== 2) page.drawRectangle({ x: L, y: y - 7, width: R - L, height: 22, color: rgb(0.95, 0.95, 0.96) });
  text("Description", L + 6, y, 9.5, bold);
  right("Qty", 372, y, 9.5, bold);
  right("Unit price", 468, y, 9.5, bold);
  right("Amount", R - 6, y, 9.5, bold);
  if (layout === 2) page.drawLine({ start: { x: L, y: y - 6 }, end: { x: R, y: y - 6 }, thickness: 0.8, color: INK });
  d.lines.forEach((l, i) => {
    y -= 24;
    text(l.description, L + 6, y);
    right(l.quantity, 372, y);
    right(usd(l.unitPriceCents), 468, y);
    right(usd(amounts[i]), R - 6, y);
    page.drawLine({ start: { x: L, y: y - 8 }, end: { x: R, y: y - 8 }, thickness: 0.4, color: rgb(0.85, 0.85, 0.87) });
  });

  y -= 36;
  right("Subtotal", 468, y);
  right(usd(subtotalCents), R - 6, y);
  y -= 17;
  right(`Tax (${(vendor.taxRateBps / 100).toFixed(2)}%)`, 468, y);
  right(usd(taxCents), R - 6, y);
  y -= 24;
  if (layout === 1) page.drawRectangle({ x: 360, y: y - 8, width: R - 360, height: 26, color: brand });
  const totalColor = layout === 1 ? rgb(1, 1, 1) : INK;
  right("Total due", 468, y, 12.5, bold, totalColor);
  right(usd(totalCents), R - 6, y, 12.5, bold, totalColor);

  y -= 56;
  text("Payment instructions", L, y, 10, bold);
  for (const line of wrap(instructions, body, 10, R - L)) {
    y -= 15;
    text(line, L, y, 10);
  }
  text("Sample document for the payD sandbox demo. Not a real bill.", L, 40, 7.5, body, GREY);

  return doc.save({ useObjectStreams: false });
}

/** The values a correct extraction of this bill gives (used for history rows and eval). */
export function billFacts(d: BillDoc) {
  const totals = billTotals(d.lines, d.vendor.taxRateBps);
  return {
    ...totals,
    payeeEmail: d.printedEmail === undefined ? d.vendor.paypalEmail : d.printedEmail,
    paymentInstructions: d.paymentInstructions ?? d.vendor.terms,
  };
}
