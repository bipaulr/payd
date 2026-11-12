import { describe, expect, it, vi } from "vitest";
import { extractBill, validateExtraction } from "@/lib/extract";
import { modelChain } from "@/lib/extract/gemini";
import { with429Backoff } from "@/lib/extract/backoff";
import { sniffMime } from "@/lib/bills/ingest";
import { mockProvider } from "./risk/fixtures";

const f = <T>(value: T, confidence = 1) => ({ value, confidence });
const good = (over: Record<string, unknown> = {}) => ({
  vendorName: f("Brightleaf Office Supply"),
  vendorPaypalEmail: f("billing@brightleaf-supply.example"),
  invoiceNumber: f("BL-1"),
  issueDate: f("2026-10-28"),
  dueDate: f("2026-11-27", 0.5),
  currency: f("USD"),
  lineItems: f([{ description: "Paper", quantity: "2", unitPrice: "10.00", amount: "20.00" }]),
  subtotal: f("20.00"),
  tax: f("0"),
  total: f("20.00"),
  paymentInstructions: f(null),
  ...over,
});
const file = { bytes: new Uint8Array([1]), mimeType: "application/pdf" };

describe("extractBill", () => {
  it("returns validated data and lists fields under 0.7 confidence", async () => {
    const { provider } = mockProvider(good());
    const res = await extractBill(file, provider);
    expect(res.ok && res.attempts).toBe(1);
    expect(res.ok && res.lowConfidence).toEqual(["dueDate"]);
  });

  it("retries once with the validation error, then succeeds", async () => {
    const { provider, generateJson } = mockProvider(good({ total: f("twenty dollars") }), good());
    const res = await extractBill(file, provider);
    expect(res.ok && res.attempts).toBe(2);
    const second = (generateJson.mock.calls as unknown as [{ instructions: string }][])[1][0];
    expect(second.instructions).toContain("failed validation");
    expect(second.instructions).toContain("total");
  });

  it("gives up after the second failure and keeps the raw output", async () => {
    const { provider } = mockProvider("not json", good({ issueDate: f("28/10/2026") }));
    const res = await extractBill(file, provider);
    expect(res.ok).toBe(false);
    expect(!res.ok && res.raw).toContain("28/10/2026");
    expect(!res.ok && res.error).toContain("issueDate");
  });

  it("rejects floats for money", () => {
    expect(validateExtraction(JSON.stringify(good({ total: f(20.0) }))).ok).toBe(false);
  });
});

describe("model fallback and backoff", () => {
  it("builds the model chain without repeats", () => {
    expect(modelChain("a", "b, c,a")).toEqual(["a", "b", "c"]);
    expect(modelChain("a", "")).toEqual(["a"]);
  });

  it("does not retry errors that are not rate limits", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("boom"));
    await expect(with429Backoff(fn, { sleep: async () => {} })).rejects.toThrow("boom");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("sniffMime", () => {
  it("types uploads by magic bytes", () => {
    expect(sniffMime(new TextEncoder().encode("%PDF-1.7"))).toBe("application/pdf");
    expect(sniffMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(sniffMime(new TextEncoder().encode("MZ executable"))).toBeNull();
    expect(sniffMime(new Uint8Array())).toBeNull();
  });
});
