import type { Approval, Decision, RiskLevel } from "@prisma/client";
import { db } from "@/lib/db";
import { transition } from "./transition";

export interface ApprovalInput {
  decision: Decision;
  actorName: string;
  /** Required for a rejection. */
  reason?: string | null;
  /** Typed by the owner; required to approve a high risk bill. */
  overrideReason?: string | null;
}

export type ApprovalRefusal =
  | "not_found"
  | "not_reviewable"
  | "not_assessed"
  | "missing_actor"
  | "missing_reason"
  | "override_required"
  | "missing_amount"
  | "no_receiver";

const clean = (s: string | null | undefined) => (s ?? "").trim();

/**
 * Pure rule check for a human decision. A high risk bill can be approved
 * only with a typed override reason; a rejection needs a reason.
 */
export function approvalProblem(
  bill: { status: string; riskLevel: RiskLevel | null; totalCents: number | null },
  input: ApprovalInput,
  receiverEmail: string | null,
): { reason: ApprovalRefusal; message: string } | null {
  if (bill.status !== "needs_review") return { reason: "not_reviewable", message: `Bill is ${bill.status}, not awaiting review` };
  if (!clean(input.actorName)) return { reason: "missing_actor", message: "Type your name to record the decision" };
  if (input.decision === "rejected") {
    return clean(input.reason) ? null : { reason: "missing_reason", message: "A rejection needs a reason" };
  }
  if (!bill.riskLevel) return { reason: "not_assessed", message: "The risk checks have not run on this bill yet" };
  if (bill.riskLevel === "high" && !clean(input.overrideReason)) {
    return { reason: "override_required", message: "This bill is high risk. Type why you are overriding the flags to approve it." };
  }
  if (bill.totalCents == null || bill.totalCents <= 0) return { reason: "missing_amount", message: "The bill has no positive total to pay" };
  if (!receiverEmail) return { reason: "no_receiver", message: "No sandbox receiver email for this payee (set PAYOUT_SMOKE_EMAIL)" };
  return null;
}

/** Sandbox account that receives the payout (docs/PLAN.md section 5.3). */
export const receiverEmailFor = (vendor: { sandboxReceiverEmail: string | null } | null) =>
  vendor?.sandboxReceiverEmail ?? process.env.PAYOUT_SMOKE_EMAIL ?? null;

export type RecordApprovalResult = { ok: true; approval: Approval } | { ok: false; reason: ApprovalRefusal; message: string };

/**
 * Record a human Approval (approved or rejected) with a snapshot of amount,
 * payee, receiver and risk level, and move the bill out of needs_review in
 * the same transaction. Paying is a separate step (payBill).
 */
export async function recordApproval(billId: string, input: ApprovalInput): Promise<RecordApprovalResult> {
  return db.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Bill" WHERE id = ${billId} FOR UPDATE`;
    if (locked.length === 0) return { ok: false, reason: "not_found", message: "Bill not found" } as const;
    const bill = await tx.bill.findUniqueOrThrow({ where: { id: billId }, include: { vendor: true } });
    const receiverEmail = input.decision === "approved" ? receiverEmailFor(bill.vendor) : null;
    const problem = approvalProblem(bill, input, receiverEmail);
    if (problem) return { ok: false, ...problem } as const;

    const approval = await tx.approval.create({
      data: {
        billId,
        decision: input.decision,
        actorName: clean(input.actorName),
        reason: clean(input.reason) || null,
        overrideReason: clean(input.overrideReason) || null,
        amountCents: bill.totalCents ?? 0,
        payeeEmail: bill.payeeEmail,
        receiverEmail,
        riskLevel: bill.riskLevel,
      },
    });
    const moved = await transition(billId, "needs_review", input.decision, {
      tx,
      actor: "user",
      action: input.decision,
      detail: {
        approvalId: approval.id,
        actorName: approval.actorName,
        riskLevel: bill.riskLevel,
        ...(approval.overrideReason ? { overrideReason: approval.overrideReason } : {}),
        ...(approval.reason ? { reason: approval.reason } : {}),
      },
    });
    if (!moved) throw new Error("bill left needs_review while locked");
    return { ok: true, approval } as const;
  });
}
