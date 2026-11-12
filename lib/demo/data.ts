/**
 * Demo data. Every vendor, person, address and email here is invented.
 * Dates are fixed (not relative to today) so the generated PDFs, their hashes
 * and the pre-extracted results in samples/demo stay stable.
 */

export interface DemoLine {
  description: string;
  /** Decimal string, e.g. "2" or "1.5". */
  quantity: string;
  unitPriceCents: number;
}

export interface DemoVendor {
  key: string;
  name: string;
  address: string[];
  /** Payee email printed on its genuine bills. */
  paypalEmail: string;
  category: string;
  /** Brand colour for the drawn logo, 0 to 1 RGB. */
  color: [number, number, number];
  layout: 0 | 1 | 2;
  /** Which DEMO_VENDOR_EMAIL_n sandbox account receives this vendor's payouts. */
  receiverSlot: 1 | 2 | 3;
  invoicePrefix: string;
  taxRateBps: number;
  terms: string;
  /** Typical monthly bill; history varies the first line's quantity around it. */
  lines: DemoLine[];
  historyCount: number;
}

export const DEMO_BUYER = { name: "Marigold Jewelry Studio", address: "18 Lantern Row, Asheville, NC 28801" };

export const DEMO_VENDORS: DemoVendor[] = [
  {
    key: "brightleaf",
    name: "Brightleaf Office Supply",
    address: ["412 Juniper Ave", "Portland, OR 97205"],
    paypalEmail: "billing@brightleaf-supply.example",
    category: "Office supplies",
    color: [0.13, 0.55, 0.33],
    layout: 0,
    receiverSlot: 1,
    invoicePrefix: "BL-2",
    taxRateBps: 0,
    terms: "Pay via PayPal to billing@brightleaf-supply.example within 30 days.",
    lines: [
      { description: "Copy paper, 10 reams", quantity: "3", unitPriceCents: 4599 },
      { description: "Gel pens, box of 24", quantity: "2", unitPriceCents: 1850 },
      { description: "Shipping labels, roll", quantity: "1", unitPriceCents: 2799 },
    ],
    historyCount: 8,
  },
  {
    key: "harborline",
    name: "Harborline IT Services LLC",
    address: ["88 Wharf Street, Suite 300", "Boston, MA 02110"],
    paypalEmail: "ar@harborline-it.example",
    category: "IT services",
    color: [0.11, 0.33, 0.67],
    layout: 1,
    receiverSlot: 2,
    invoicePrefix: "HIT-2026-01",
    taxRateBps: 625,
    terms: "Net 14. Send PayPal payment to ar@harborline-it.example and reference the invoice number.",
    lines: [
      { description: "Managed IT support, monthly", quantity: "1", unitPriceCents: 125000 },
      { description: "On-site repair labor (hours)", quantity: "2.5", unitPriceCents: 9500 },
    ],
    historyCount: 7,
  },
  {
    key: "greenfork",
    name: "Greenfork Catering Co.",
    address: ["7 Mill Road", "Austin, TX 78701"],
    paypalEmail: "payments@greenfork-catering.example",
    category: "Catering",
    color: [0.36, 0.5, 0.12],
    layout: 2,
    receiverSlot: 3,
    invoicePrefix: "GF-55",
    taxRateBps: 825,
    terms: "Payment by PayPal to payments@greenfork-catering.example. Thank you for your business.",
    lines: [
      { description: "Team lunch buffet (per person)", quantity: "18", unitPriceCents: 1675 },
      { description: "Delivery fee", quantity: "1", unitPriceCents: 3500 },
    ],
    historyCount: 7,
  },
  {
    key: "asha",
    name: "Asha Traders",
    address: ["230 Canal Street", "New York, NY 10013"],
    paypalEmail: "accounts@ashatraders.example",
    category: "Inventory",
    color: [0.76, 0.33, 0.1],
    layout: 1,
    receiverSlot: 1,
    invoicePrefix: "AT-10",
    taxRateBps: 0,
    terms: "Net 30. PayPal: accounts@ashatraders.example.",
    lines: [
      { description: "Sterling silver chain, 18 in", quantity: "12", unitPriceCents: 3400 },
      { description: "Jewelry gift boxes, pack of 50", quantity: "2", unitPriceCents: 4250 },
    ],
    historyCount: 6,
  },
  {
    key: "pinecrest",
    name: "Pinecrest Print Works",
    address: ["56 Alder Lane", "Madison, WI 53703"],
    paypalEmail: "invoices@pinecrest-print.example",
    category: "Printing",
    color: [0.42, 0.22, 0.6],
    layout: 0,
    receiverSlot: 2,
    invoicePrefix: "PPW-31",
    taxRateBps: 550,
    terms: "Due in 15 days. Pay by PayPal to invoices@pinecrest-print.example.",
    lines: [
      { description: "Product catalog, 24 pages, full colour", quantity: "150", unitPriceCents: 210 },
      { description: "Business cards, box of 500", quantity: "2", unitPriceCents: 3900 },
    ],
    historyCount: 7,
  },
];

export interface DemoBillDoc {
  /** File name without extension, under samples/demo. */
  file: string;
  kind: "clean" | "duplicate" | "fake";
  vendorKey: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  lines: DemoLine[];
  /** Overrides for the fake: a different printed email, layout and wording. */
  printedEmail?: string;
  paymentInstructions?: string;
  notice?: string;
  layout?: 0 | 1 | 2;
}

const v = (key: string) => {
  const found = DEMO_VENDORS.find((x) => x.key === key);
  if (!found) throw new Error(`unknown demo vendor ${key}`);
  return found;
};
export const demoVendor = v;

/** Invoice number of history bill n (1-based) for a vendor. */
export const historyInvoiceNumber = (vendor: DemoVendor, n: number) => `${vendor.invoicePrefix}${String(n).padStart(2, "0")}`;

/** History bill n of `count`: one per month, the newest issued in late October 2026. */
export function historyDates(n: number, count: number, vendorIndex: number) {
  const monthsBack = count - n; // newest = 0
  const issue = new Date(Date.UTC(2026, 9 - monthsBack, 6 + vendorIndex * 4));
  const due = new Date(issue.getTime() + 21 * 86_400_000);
  const paid = new Date(issue.getTime() + (9 + ((n + vendorIndex) % 5)) * 86_400_000);
  return { issue, due, paid };
}

/** History varies the first line's quantity a little so totals look real but stay near the median. */
export function historyLines(vendor: DemoVendor, n: number): DemoLine[] {
  const [first, ...rest] = vendor.lines;
  const bump = [0, 1, -1, 2, 0, 1, -1, 0][n % 8];
  const isWhole = !first.quantity.includes(".");
  const qty = isWhole ? String(Math.max(1, Number(first.quantity) + bump)) : first.quantity;
  const unit = isWhole ? first.unitPriceCents : first.unitPriceCents + bump * 2500;
  return [{ ...first, quantity: qty, unitPriceCents: unit }, ...rest];
}

/** The five new bills the demo puts in the inbox. */
export const DEMO_BILLS: DemoBillDoc[] = [
  {
    file: "01-brightleaf-office-supply",
    kind: "clean",
    vendorKey: "brightleaf",
    invoiceNumber: "BL-20417",
    issueDate: "2026-11-06",
    dueDate: "2026-12-06",
    lines: v("brightleaf").lines,
  },
  {
    file: "02-harborline-it-services",
    kind: "clean",
    vendorKey: "harborline",
    invoiceNumber: "HIT-2026-0193",
    issueDate: "2026-11-09",
    dueDate: "2026-11-23",
    lines: v("harborline").lines,
  },
  {
    file: "03-greenfork-catering",
    kind: "clean",
    vendorKey: "greenfork",
    invoiceNumber: "GF-5521",
    issueDate: "2026-11-10",
    dueDate: "2026-11-24",
    lines: v("greenfork").lines,
  },
  {
    // Same vendor and invoice number as Pinecrest's newest paid bill, but a new file (a re-sent copy).
    file: "04-pinecrest-print-works-copy",
    kind: "duplicate",
    vendorKey: "pinecrest",
    invoiceNumber: historyInvoiceNumber(v("pinecrest"), v("pinecrest").historyCount),
    issueDate: "2026-10-22",
    dueDate: "2026-11-18",
    lines: historyLines(v("pinecrest"), v("pinecrest").historyCount),
    layout: 2,
  },
  {
    // A known vendor's name and logo, a different PayPal email, about 4x the usual total, and pressure wording.
    file: "05-asha-traders-urgent",
    kind: "fake",
    vendorKey: "asha",
    invoiceNumber: "AT-1093",
    issueDate: "2026-11-11",
    dueDate: "2026-11-13",
    lines: [
      { description: "Sterling silver chain, 18 in", quantity: "48", unitPriceCents: 3400 },
      { description: "Jewelry gift boxes, pack of 50", quantity: "6", unitPriceCents: 4250 },
    ],
    printedEmail: "asha.traders.pay@mail.example",
    paymentInstructions:
      "URGENT: our account details have changed. Pay today by PayPal to asha.traders.pay@mail.example only. Do not use the old account. Late payment will hold your next shipment.",
    notice: "URGENT - PAYMENT DETAILS HAVE CHANGED",
  },
];
