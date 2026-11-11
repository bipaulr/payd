import { recordApproval, type ApprovalInput } from "./approve";
import { payBill } from "./payBill";

export type ApproveAndPayResult =
  | { ok: true }
  | { ok: false; stage: "approval" | "payment"; reason: string; message: string };

/** Record the human approval, then pay. A failed payment leaves the bill approved for "Retry payment". */
export async function approveAndPay(billId: string, input: Omit<ApprovalInput, "decision">): Promise<ApproveAndPayResult> {
  const approval = await recordApproval(billId, { ...input, decision: "approved" });
  if (!approval.ok) return { ok: false, stage: "approval", reason: approval.reason, message: approval.message };
  const pay = await payBill(billId);
  if (!pay.ok) return { ok: false, stage: "payment", reason: pay.reason, message: pay.message };
  return { ok: true };
}
