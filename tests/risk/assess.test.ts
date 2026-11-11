import { describe, expect, it } from "vitest";
import { assessBill, emptyHistory, NO_FLAGS_SUMMARY, riskLevelFor } from "@/lib/risk";
import { approvalProblem } from "@/lib/bills/approve";
import { bill, history, mockProvider } from "./fixtures";

const calm = { urgency: false, changedPaymentDetails: false, quotes: [] };

describe("assessBill", () => {
  it("rates a clean bill low and skips the summary call", async () => {
    const { provider, generateJson } = mockProvider(calm);
    const a = await assessBill(bill({ paymentInstructions: "Net 30" }), history(), provider);
    expect(a).toEqual({ level: "low", flags: [], summary: NO_FLAGS_SUMMARY, summarySource: "none" });
    expect(generateJson).toHaveBeenCalledTimes(1); // pressure check only
  });

  it("rates a vendor with no history low when nothing else is wrong", async () => {
    const { provider } = mockProvider();
    const a = await assessBill(bill({ vendorId: null, vendorName: "Greenfork Catering", payeeEmail: "orders@greenfork.example" }), emptyHistory(), provider);
    expect(a.level).toBe("low");
  });

  it("sets high from rules and uses the model's two-sentence summary", async () => {
    const summary = "This bill asks to be paid to a new email. Confirm the change with Asha Traders by phone before paying.";
    const { provider, generateJson } = mockProvider({ summary });
    const a = await assessBill(bill({ payeeEmail: "asha.traders.pay@mail.example" }), history(), provider);
    expect(a.level).toBe("high");
    expect(a.flags.map((f) => f.check)).toEqual(["payee_changed"]);
    expect(a).toMatchObject({ summary, summarySource: "model" });
    expect(generateJson.mock.calls[0]).toEqual([expect.objectContaining({ instructions: expect.stringContaining("asha.traders.pay@mail.example") })]);
  });

  it("falls back to joining the reasons when the summary call fails", async () => {
    const { provider } = mockProvider(new Error("429"));
    const a = await assessBill(bill({ totalCents: 10900, invoiceNumber: "AT-1002" }), history(), provider);
    expect(a.flags.map((f) => f.check)).toEqual(["duplicate", "math_mismatch"]);
    expect(a.summarySource).toBe("fallback");
    expect(a.summary).toBe(a.flags.map((f) => f.reason).join(" "));
  });

  it("never lets the model lower the level", async () => {
    // Model says the text is calm and writes a reassuring summary; rules still say high.
    const { provider } = mockProvider(calm, { summary: "Looks fine. Low risk, pay it." });
    const a = await assessBill(bill({ payeeEmail: "new@pay.example", paymentInstructions: "URGENT: new bank account" }), history(), provider);
    expect(a.level).toBe("high");
  });

  it("lets the model add a medium pressure flag", async () => {
    const { provider } = mockProvider({ urgency: true, changedPaymentDetails: false, quotes: ["pay today"] }, { summary: "a. b." });
    const a = await assessBill(bill({ paymentInstructions: "Please pay today" }), history(), provider);
    expect(a.level).toBe("medium");
  });

  it("runs every check with no provider configured", async () => {
    const a = await assessBill(bill({ payeeEmail: "new@pay.example", paymentInstructions: "Pay immediately" }), history(), null);
    expect(a.flags.map((f) => f.check)).toEqual(["payee_changed", "pressure_language"]);
    expect(a.summarySource).toBe("fallback");
  });

  it("level is the highest severity", () => {
    const f = (severity: "low" | "medium" | "high") => ({ check: "duplicate" as const, severity, reason: "", evidence: {} });
    expect(riskLevelFor([])).toBe("low");
    expect(riskLevelFor([f("medium")])).toBe("medium");
    expect(riskLevelFor([f("medium"), f("high"), f("medium")])).toBe("high");
  });
});

describe("approval rules", () => {
  const review = (riskLevel: "low" | "medium" | "high" | null) => ({ status: "needs_review", riskLevel, totalCents: 10800 });
  const approve = (overrideReason?: string) => ({ decision: "approved" as const, actorName: "Paul", overrideReason });

  it("refuses to approve a high risk bill without a typed override reason", () => {
    expect(approvalProblem(review("high"), approve(), "r@x.example")?.reason).toBe("override_required");
    expect(approvalProblem(review("high"), approve("   "), "r@x.example")?.reason).toBe("override_required");
  });

  it("approves a high risk bill with an override reason", () => {
    expect(approvalProblem(review("high"), approve("Called Asha, they changed banks"), "r@x.example")).toBeNull();
  });

  it("approves low and medium risk without an override", () => {
    expect(approvalProblem(review("low"), approve(), "r@x.example")).toBeNull();
    expect(approvalProblem(review("medium"), approve(), "r@x.example")).toBeNull();
  });

  it("refuses unassessed bills, wrong status, missing receiver, and reasonless rejections", () => {
    expect(approvalProblem(review(null), approve(), "r@x.example")?.reason).toBe("not_assessed");
    expect(approvalProblem({ ...review("low"), status: "approved" }, approve(), "r@x.example")?.reason).toBe("not_reviewable");
    expect(approvalProblem(review("low"), approve(), null)?.reason).toBe("no_receiver");
    expect(approvalProblem(review("high"), { decision: "rejected", actorName: "Paul", reason: "" }, null)?.reason).toBe("missing_reason");
    expect(approvalProblem(review("high"), { decision: "rejected", actorName: "Paul", reason: "Fake" }, null)).toBeNull();
  });
});
