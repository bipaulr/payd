import { z } from "zod";
import type { VisionProvider } from "@/lib/extract/provider";
import { SEVERITY_RANK, type RiskBill, type RiskFlag, type RiskLevel, type VendorHistory } from "./types";
import { checkDuplicate } from "./checks/duplicate";
import { checkPayeeChanged } from "./checks/payeeChanged";
import { checkAmountAnomaly } from "./checks/amountAnomaly";
import { checkMathMismatch } from "./checks/mathMismatch";
import { checkLookalikeVendor } from "./checks/lookalikeVendor";
import { checkPressureLanguage } from "./checks/pressureLanguage";

export interface RiskAssessment {
  level: RiskLevel;
  flags: RiskFlag[];
  summary: string;
  /** "model" when the summary came from the model, "fallback" when the reasons were joined. */
  summarySource: "model" | "fallback" | "none";
}

export const NO_FLAGS_SUMMARY = "No risk checks fired: the vendor, payee email, amount and arithmetic all look consistent with past bills.";

/** Rules decide the level: the highest severity of any flag, low when there are none. */
export function riskLevelFor(flags: RiskFlag[]): RiskLevel {
  return flags.reduce<RiskLevel>((lvl, f) => (SEVERITY_RANK[f.severity] > SEVERITY_RANK[lvl] ? f.severity : lvl), "low");
}

export const SummarySchema = z.object({
  summary: z.string().describe("Exactly two plain sentences for the business owner"),
});

export const summaryInstructions = (level: RiskLevel, flags: RiskFlag[]) => `You help a small-business owner decide whether to pay a bill.
The risk engine rated it ${level.toUpperCase()} risk and raised these flags:
${flags.map((f, i) => `${i + 1}. [${f.severity}] ${f.check}: ${f.reason}`).join("\n")}
Write exactly two short sentences in plain language: what is wrong, citing the evidence, and what to check before paying.
Do not change or soften the risk level, and do not invent facts that are not in the flags.`;

export const fallbackSummary = (flags: RiskFlag[]) => (flags.length ? flags.map((f) => f.reason).join(" ") : NO_FLAGS_SUMMARY);

/** One model call; any failure falls back to joining the flag reasons. */
export async function summarizeFlags(
  level: RiskLevel,
  flags: RiskFlag[],
  provider: VisionProvider | null,
): Promise<{ summary: string; source: RiskAssessment["summarySource"] }> {
  if (!flags.length) return { summary: NO_FLAGS_SUMMARY, source: "none" };
  if (!provider) return { summary: fallbackSummary(flags), source: "fallback" };
  try {
    const raw = await provider.generateJson({ instructions: summaryInstructions(level, flags), schema: SummarySchema });
    const summary = SummarySchema.parse(JSON.parse(raw)).summary.trim();
    if (!summary) throw new Error("empty summary");
    return { summary, source: "model" };
  } catch {
    return { summary: fallbackSummary(flags), source: "fallback" };
  }
}

/**
 * Run all six checks, set the level from the rules, then ask the model for a
 * two-sentence summary. The model can add a pressure_language flag but never
 * lowers the level: the summary has no say in it. With no provider (no API
 * key) the model-backed parts use their deterministic fallbacks.
 */
export async function assessBill(bill: RiskBill, history: VendorHistory, provider: VisionProvider | null): Promise<RiskAssessment> {
  const fallbackProvider: VisionProvider = {
    model: "none",
    generateJson: () => Promise.reject(new Error("no model provider configured")),
  };
  const ruleFlags = [
    checkDuplicate(bill, history),
    checkPayeeChanged(bill, history),
    checkAmountAnomaly(bill, history),
    checkMathMismatch(bill),
    checkLookalikeVendor(bill, history),
  ];
  const pressure = await checkPressureLanguage(bill, provider ?? fallbackProvider);
  const flags = [...ruleFlags, pressure].filter((f): f is RiskFlag => f !== null);
  const level = riskLevelFor(flags);
  const { summary, source } = await summarizeFlags(level, flags, provider);
  return { level, flags, summary, summarySource: source };
}
