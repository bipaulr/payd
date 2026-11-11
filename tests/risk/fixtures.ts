import { vi } from "vitest";
import type { VisionProvider } from "@/lib/extract/provider";
import type { KnownVendor, PastBill, RiskBill, VendorHistory } from "@/lib/risk";

export const ASHA: KnownVendor = { id: "v_asha", name: "Asha Traders", paypalEmail: "accounts@ashatraders.example" };
export const BRIGHT: KnownVendor = { id: "v_bright", name: "Brightleaf Office Supply", paypalEmail: "billing@brightleaf.example" };

export function bill(over: Partial<RiskBill> = {}): RiskBill {
  return {
    id: "b_new",
    vendorId: ASHA.id,
    vendorName: ASHA.name,
    proposedVendorEmail: null,
    invoiceNumber: "AT-1007",
    issueDate: new Date("2026-11-01T00:00:00Z"),
    subtotalCents: 10000,
    taxCents: 800,
    totalCents: 10800,
    payeeEmail: ASHA.paypalEmail,
    paymentInstructions: null,
    fileSha256: "hash-new",
    lineItems: [
      { description: "Rice 25kg", amountCents: 6000 },
      { description: "Lentils 10kg", amountCents: 4000 },
    ],
    ...over,
  };
}

export function past(n: number, over: Partial<PastBill> = {}): PastBill {
  return {
    id: `b_past_${n}`,
    invoiceNumber: `AT-100${n}`,
    issueDate: new Date(`2026-0${n}-01T00:00:00Z`),
    totalCents: 10000 + n * 100,
    fileSha256: `hash-${n}`,
    status: "paid",
    createdAt: new Date(`2026-0${n}-02T00:00:00Z`),
    ...over,
  };
}

/** Asha Traders with six paid bills, all paid to the address on file. */
export function history(over: Partial<VendorHistory> = {}): VendorHistory {
  const pastBills = [1, 2, 3, 4, 5, 6].map((n) => past(n));
  return {
    vendor: ASHA,
    pastBills,
    pastPayouts: pastBills.map((b) => ({ billId: b.id, payeeEmail: ASHA.paypalEmail })),
    knownVendors: [ASHA, BRIGHT],
    ...over,
  };
}

/** A provider whose generateJson returns (or throws) the queued responses in order. */
export function mockProvider(...responses: (object | string | Error)[]) {
  const generateJson = vi.fn(async () => {
    const r = responses.shift();
    if (r === undefined) throw new Error("unexpected model call");
    if (r instanceof Error) throw r;
    return typeof r === "string" ? r : JSON.stringify(r);
  });
  const provider: VisionProvider = { model: "mock-model", generateJson };
  return { provider, generateJson };
}
