import type { Payout, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { createPayout, PayPalError, senderBatchIdFor, senderItemIdFor } from "@/lib/paypal";
import type { PayoutBatch } from "@/lib/paypal";
import { applyPayoutStatus } from "./payoutStatus";
import { transition } from "./transition";

export type PayBillRefusal = "not_found" | "not_approved" | "no_approval" | "snapshot_mismatch";

export type PayBillResult =
  | { ok: true; payout: Payout; batch: PayoutBatch }
  | { ok: false; reason: PayBillRefusal; message: string }
  | { ok: false; reason: "paypal_error"; message: string; payout: Payout };

class Refused extends Error {
  constructor(
    readonly reason: PayBillRefusal,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Pay one approved bill (docs/PLAN.md section 2). In one transaction: lock the
 * bill, require status `approved` and a latest Approval of `approved` whose
 * snapshot matches the bill, upsert the Payout by billId and move the bill to
 * `paying`. Then call PayPal outside the transaction. Double clicks and retries
 * hit the same Payout row and the same sender_batch_id.
 */
export async function payBill(billId: string): Promise<PayBillResult> {
  let payout: Payout;
  try {
    payout = await db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Bill" WHERE id = ${billId} FOR UPDATE`;
      if (locked.length === 0) throw new Refused("not_found", "Bill not found");
      const bill = await tx.bill.findUniqueOrThrow({ where: { id: billId } });
      if (bill.status !== "approved") {
        throw new Refused("not_approved", `Bill is ${bill.status}, not approved`);
      }
      const approval = await tx.approval.findFirst({ where: { billId }, orderBy: { createdAt: "desc" } });
      if (!approval || approval.decision !== "approved") {
        throw new Refused("no_approval", "No recorded human approval for this bill");
      }
      if (
        bill.totalCents === null ||
        approval.amountCents !== bill.totalCents ||
        approval.payeeEmail !== bill.payeeEmail ||
        !approval.receiverEmail
      ) {
        throw new Refused("snapshot_mismatch", "Bill changed since it was approved; approve it again");
      }
      const existing = await tx.payout.findUnique({ where: { billId } });
      if (existing && (existing.amountCents !== approval.amountCents || existing.receiverEmail !== approval.receiverEmail)) {
        throw new Refused("snapshot_mismatch", "Existing payout does not match the approval");
      }
      const row = await tx.payout.upsert({
        where: { billId },
        create: {
          billId,
          approvalId: approval.id,
          senderBatchId: senderBatchIdFor(billId),
          senderItemId: senderItemIdFor(billId),
          amountCents: approval.amountCents,
          currency: "USD",
          payeeEmail: approval.payeeEmail,
          receiverEmail: approval.receiverEmail,
        },
        update: { lastError: null },
      });
      const moved = await transition(billId, "approved", "paying", {
        actor: "system",
        action: "payment_started",
        detail: { senderBatchId: row.senderBatchId, approvalId: approval.id },
        tx,
      });
      if (!moved) throw new Refused("not_approved", "Bill is no longer approved");
      return row;
    });
  } catch (err) {
    if (err instanceof Refused) return { ok: false, reason: err.reason, message: err.message };
    throw err;
  }

  const bill = await db.bill.findUniqueOrThrow({ where: { id: billId }, select: { invoiceNumber: true } });
  let batch: PayoutBatch;
  try {
    batch = await createPayout({
      id: billId,
      amountCents: payout.amountCents,
      receiverEmail: payout.receiverEmail,
      invoiceNumber: bill.invoiceNumber,
    });
  } catch (err) {
    // No batch accepted: back to approved with the error; "Retry payment" resends the same ids.
    const message = err instanceof Error ? err.message : String(err);
    const body = err instanceof PayPalError ? err.body : null;
    const failed = await db.payout.update({
      where: { id: payout.id },
      data: { lastError: message, lastResponse: (body ?? undefined) as Prisma.InputJsonValue | undefined },
    });
    await transition(billId, "paying", "approved", { actor: "system", action: "payout_error", detail: { message } });
    return { ok: false, reason: "paypal_error", message, payout: failed };
  }

  const item = batch.items.find((i) => i.senderItemId === payout.senderItemId) ?? batch.items[0];
  await db.activityLog.create({
    data: {
      billId,
      actor: "paypal",
      action: "payout_created",
      detail: { payoutBatchId: batch.payoutBatchId, batchStatus: batch.batchStatus, duplicate: batch.duplicate },
    },
  });
  await applyPayoutStatus(
    payout,
    {
      payoutBatchId: batch.payoutBatchId,
      batchStatus: batch.batchStatus,
      payoutItemId: item?.payoutItemId,
      itemStatus: item?.transactionStatus,
      lastResponse: batch.raw,
    },
    "paypal",
  );
  return { ok: true, payout: await db.payout.findUniqueOrThrow({ where: { id: payout.id } }), batch };
}
