import { describe, expect, it } from "vitest";
import {
  checkAmountAnomaly,
  checkDuplicate,
  checkLookalikeVendor,
  checkMathMismatch,
  checkPayeeChanged,
  checkPressureLanguage,
  editDistance,
  emptyHistory,
} from "@/lib/risk";
import { ASHA, BRIGHT, bill, history, mockProvider, past } from "./fixtures";

describe("duplicate", () => {
  it("passes a new invoice number with a new total and date", () => {
    expect(checkDuplicate(bill(), history())).toBeNull();
  });

  it("flags the same vendor and invoice number even when the file hash differs", () => {
    const flag = checkDuplicate(bill({ invoiceNumber: "AT-1003", fileSha256: "rescanned" }), history());
    expect(flag).toMatchObject({ check: "duplicate", severity: "high", evidence: { matchedBillId: "b_past_3", matchedOn: "invoice_number", sameFile: false } });
    expect(flag?.reason).toBe("Invoice AT-1003 from Asha Traders was already received on 2026-03-02 (that bill is paid).");
  });

  it("matches invoice numbers ignoring case and spaces", () => {
    expect(checkDuplicate(bill({ invoiceNumber: " at-1003 " }), history())?.check).toBe("duplicate");
  });

  it("flags the same vendor, total and issue date under a different invoice number", () => {
    const h = history();
    const flag = checkDuplicate(bill({ invoiceNumber: "AT-9999", totalCents: h.pastBills[1].totalCents, issueDate: h.pastBills[1].issueDate }), h);
    expect(flag).toMatchObject({ evidence: { matchedOn: "total_and_issue_date", matchedBillId: "b_past_2" } });
    expect(flag?.reason).toContain("$102.00 dated 2026-02-01");
  });

  it("does not match same total on a different date", () => {
    expect(checkDuplicate(bill({ totalCents: 10200, issueDate: new Date("2026-02-03T00:00:00Z") }), history())).toBeNull();
  });

  it("passes a vendor with no history", () => {
    expect(checkDuplicate(bill({ invoiceNumber: "AT-1003" }), emptyHistory())).toBeNull();
  });

  it("ignores the bill itself and rejected bills", () => {
    const h = history({ pastBills: [past(3, { id: "b_new" }), past(4, { status: "rejected" })] });
    expect(checkDuplicate(bill({ invoiceNumber: "AT-1003" }), h)).toBeNull();
    expect(checkDuplicate(bill({ invoiceNumber: "AT-1004" }), h)).toBeNull();
  });

  it("does not match on a missing invoice number", () => {
    const h = history({ pastBills: [past(1, { invoiceNumber: null })] });
    expect(checkDuplicate(bill({ invoiceNumber: null }), h)).toBeNull();
  });
});

describe("payee_changed", () => {
  it("passes when the bill asks for the email used in past payouts", () => {
    expect(checkPayeeChanged(bill({ payeeEmail: "Accounts@AshaTraders.example" }), history())).toBeNull();
  });

  it("flags a new payee email as high severity, naming both emails", () => {
    const flag = checkPayeeChanged(bill({ payeeEmail: "asha.traders.pay@mail.example" }), history());
    expect(flag?.severity).toBe("high");
    expect(flag?.reason).toBe(
      "Past 6 payments to Asha Traders went to accounts@ashatraders.example. This bill asks for asha.traders.pay@mail.example.",
    );
  });

  it("uses the vendor email on file when there are no past payouts", () => {
    const h = history({ pastPayouts: [] });
    expect(checkPayeeChanged(bill(), h)).toBeNull();
    const flag = checkPayeeChanged(bill({ payeeEmail: "pay@elsewhere.example" }), h);
    expect(flag).toMatchObject({ severity: "high", evidence: { vendorEmailOnFile: ASHA.paypalEmail, pastPayments: 0 } });
  });

  it("passes when there is no confirmed vendor or no payee email", () => {
    expect(checkPayeeChanged(bill({ payeeEmail: "x@y.example" }), emptyHistory())).toBeNull();
    expect(checkPayeeChanged(bill({ payeeEmail: null }), history())).toBeNull();
  });

  it("accepts any email the vendor was already paid at", () => {
    const h = history({ pastPayouts: [{ billId: "p1", payeeEmail: "old@asha.example" }, { billId: "p2", payeeEmail: ASHA.paypalEmail }] });
    expect(checkPayeeChanged(bill({ payeeEmail: "old@asha.example" }), h)).toBeNull();
  });
});

describe("amount_anomaly", () => {
  const h = history({ pastBills: [past(1, { totalCents: 9000 }), past(2, { totalCents: 10000 }), past(3, { totalCents: 50000 })] });

  it("passes a total at exactly 3x the median", () => {
    expect(checkAmountAnomaly(bill({ totalCents: 30000 }), h)).toBeNull();
  });

  it("flags a total more than 3x the median", () => {
    const flag = checkAmountAnomaly(bill({ totalCents: 30001 }), h);
    expect(flag).toMatchObject({ check: "amount_anomaly", severity: "medium", evidence: { medianCents: 10000, pastBills: 3 } });
    expect(flag?.reason).toBe("This bill is $300.01, more than 3x the $100.00 median of Asha Traders's last 3 bills.");
  });

  it("needs at least three past bills", () => {
    const two = history({ pastBills: [past(1, { totalCents: 100 }), past(2, { totalCents: 100 })] });
    expect(checkAmountAnomaly(bill({ totalCents: 1_000_000 }), two)).toBeNull();
    expect(checkAmountAnomaly(bill({ totalCents: 1_000_000 }), emptyHistory())).toBeNull();
  });

  it("uses the mean of the middle two for an even count, in whole cents", () => {
    const four = history({ pastBills: [1, 2, 3, 4].map((n) => past(n, { totalCents: [900, 101, 102, 100][n - 1] })) });
    // sorted 100, 101, 102, 900: median = 101.5 cents; 3x = 304.5
    expect(checkAmountAnomaly(bill({ totalCents: 304 }), four)).toBeNull();
    expect(checkAmountAnomaly(bill({ totalCents: 305 }), four)?.check).toBe("amount_anomaly");
  });

  it("ignores rejected bills and bills without a total", () => {
    const hh = history({
      pastBills: [past(1, { totalCents: 100 }), past(2, { totalCents: 100 }), past(3, { totalCents: 100, status: "rejected" }), past(4, { totalCents: null })],
    });
    expect(checkAmountAnomaly(bill({ totalCents: 100_000 }), hh)).toBeNull();
  });
});

describe("math_mismatch", () => {
  it("passes when line items, tax and total agree", () => {
    expect(checkMathMismatch(bill())).toBeNull();
  });

  it("allows a one cent rounding difference", () => {
    expect(checkMathMismatch(bill({ totalCents: 10801 }))).toBeNull();
    expect(checkMathMismatch(bill({ subtotalCents: 9999, totalCents: 10799 }))).toBeNull();
  });

  it("flags a total off by more than one cent", () => {
    const flag = checkMathMismatch(bill({ totalCents: 10802 }));
    expect(flag).toMatchObject({ check: "math_mismatch", severity: "medium", evidence: { expectedTotalCents: 10800 } });
    expect(flag?.reason).toBe("The numbers on this bill do not add up: subtotal $100.00 plus $8.00 tax make $108.00 but the total says $108.02.");
  });

  it("flags line items that do not add up to the subtotal", () => {
    const flag = checkMathMismatch(bill({ subtotalCents: 12000, totalCents: 12800 }));
    expect(flag?.reason).toContain("line items add up to $100.00 but the subtotal says $120.00");
  });

  it("uses line items when there is no subtotal, and no tax as zero", () => {
    expect(checkMathMismatch(bill({ subtotalCents: null, taxCents: null, totalCents: 10000 }))).toBeNull();
    expect(checkMathMismatch(bill({ subtotalCents: null, taxCents: null, totalCents: 10800 }))?.reason).toContain("line items $100.00 make $100.00");
  });

  it("passes when there is nothing to compare", () => {
    expect(checkMathMismatch(bill({ lineItems: [], subtotalCents: null, totalCents: 5000 }))).toBeNull();
    expect(checkMathMismatch(bill({ totalCents: null }))).toBeNull();
  });
});

describe("lookalike_vendor", () => {
  const newVendor = (name: string, email: string | null) =>
    bill({ vendorId: null, vendorName: name, proposedVendorEmail: email, payeeEmail: email });
  const known = history({ vendor: null, pastBills: [], pastPayouts: [] });

  it("passes a new vendor that looks like no one", () => {
    expect(checkLookalikeVendor(newVendor("Greenfork Catering", "orders@greenfork.example"), known)).toBeNull();
  });

  it("flags a new vendor name within edit distance 2 of a known vendor", () => {
    const flag = checkLookalikeVendor(newVendor("Asha Tradres LLC", "pay@other.example"), known);
    expect(flag).toMatchObject({ check: "lookalike_vendor", severity: "high", evidence: { matchedOn: "name", knownVendorId: ASHA.id, distance: 2 } });
    expect(flag?.reason).toBe('"Asha Tradres LLC" is a new vendor, and its name is 2 characters away from known vendor "Asha Traders".');
  });

  it("flags a new payee email within edit distance 2 of a known vendor's email", () => {
    const flag = checkLookalikeVendor(newVendor("Totally New Co", "billing@brightleef.example"), known);
    expect(flag).toMatchObject({ evidence: { matchedOn: "email", knownEmail: BRIGHT.paypalEmail, distance: 1 } });
  });

  it("does not flag distance 3", () => {
    expect(checkLookalikeVendor(newVendor("Ashe Tredars", null), known)).toBeNull();
    expect(editDistance("ashe tredars", "asha traders")).toBe(3);
  });

  it("does not flag an established vendor", () => {
    expect(checkLookalikeVendor(bill({ vendorName: "Asha Traders" }), history({ knownVendors: [ASHA, { ...BRIGHT, name: "Asha Trader" }] }))).toBeNull();
  });

  it("checks a confirmed vendor with no earlier bills, but not against itself", () => {
    const fresh = { id: "v_fresh", name: "Asha Tradrs", paypalEmail: "pay@fresh.example" };
    const h = history({ vendor: fresh, pastBills: [], pastPayouts: [], knownVendors: [ASHA, fresh] });
    expect(checkLookalikeVendor(bill({ vendorId: fresh.id, vendorName: fresh.name, payeeEmail: fresh.paypalEmail }), h)?.evidence.knownVendorId).toBe(ASHA.id);
  });

  it("passes when there are no known vendors, or names are too short to compare", () => {
    expect(checkLookalikeVendor(newVendor("Asha Tradres", null), emptyHistory())).toBeNull();
    expect(checkLookalikeVendor(newVendor("ABC", null), history({ vendor: null, pastBills: [], knownVendors: [{ id: "x", name: "XYZ", paypalEmail: "x@x.example" }] }))).toBeNull();
  });
});

describe("pressure_language", () => {
  const text = "URGENT: our bank details have changed. Pay today to the new PayPal account or service stops.";

  it("passes calm instructions", async () => {
    const { provider, generateJson } = mockProvider({ urgency: false, changedPaymentDetails: false, quotes: [] });
    expect(await checkPressureLanguage(bill({ paymentInstructions: "Pay via PayPal within 30 days. Thank you!" }), provider)).toBeNull();
    expect(generateJson).toHaveBeenCalledTimes(1);
  });

  it("flags urgency and changed payment details with the model's quotes", async () => {
    const { provider, generateJson } = mockProvider({ urgency: true, changedPaymentDetails: true, quotes: ["URGENT", "our bank details have changed"] });
    const flag = await checkPressureLanguage(bill({ paymentInstructions: text }), provider);
    expect(flag).toMatchObject({ check: "pressure_language", severity: "medium", evidence: { source: "model", model: "mock-model" } });
    expect(flag?.reason).toBe('The payment instructions push for immediate payment and say the payment details changed: "URGENT", "our bank details have changed".');
    expect(generateJson).toHaveBeenCalledTimes(1);
    expect(generateJson.mock.calls[0]).toEqual([expect.objectContaining({ instructions: expect.stringContaining(text) })]);
  });

  it("makes no model call when there are no payment instructions", async () => {
    const { provider, generateJson } = mockProvider();
    expect(await checkPressureLanguage(bill({ paymentInstructions: "   " }), provider)).toBeNull();
    expect(generateJson).not.toHaveBeenCalled();
  });

  it("falls back to a keyword scan when the model fails, so a scam is still flagged", async () => {
    const { provider } = mockProvider(new Error("503 overloaded"));
    const flag = await checkPressureLanguage(bill({ paymentInstructions: text }), provider);
    expect(flag).toMatchObject({ evidence: { source: "keywords", urgency: true, changedPaymentDetails: true } });
  });

  it("falls back on invalid model JSON and passes calm text", async () => {
    const { provider } = mockProvider("not json");
    expect(await checkPressureLanguage(bill({ paymentInstructions: "Net 30. PayPal accepted." }), provider)).toBeNull();
  });
});
