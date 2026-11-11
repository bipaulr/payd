import type { Actor, Payout, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { payoutOutcome } from "@/lib/paypal/status";
import { transition } from "./transition";

export interface PayoutStatusUpdate {
  payoutBatchId?: string | null;
  batchStatus?: string | null;
  payoutItemId?: string | null;
  itemStatus?: string | null;
  lastResponse?: unknown;
}

/**
 * Record the latest PayPal status on a Payout and move its Bill:
 * paying -> paid on item SUCCESS, paying -> failed on a failed item or batch.
 * Idempotent: transitions are conditional, so replays change nothing.
 */
export async function applyPayoutStatus(
  payout: Payout,
  update: PayoutStatusUpdate,
  actor: Actor,
): Promise<"paid" | "failed" | "pending"> {
  const batchStatus = update.batchStatus ?? payout.batchStatus;
  const itemStatus = update.itemStatus ?? payout.itemStatus;
  const outcome = payoutOutcome(batchStatus, itemStatus);
  const detail = { payoutBatchId: update.payoutBatchId ?? payout.payoutBatchId, batchStatus, itemStatus };

  await db.$transaction(async (tx) => {
    await tx.payout.update({
      where: { id: payout.id },
      data: {
        payoutBatchId: update.payoutBatchId ?? undefined,
        payoutItemId: update.payoutItemId ?? undefined,
        batchStatus,
        itemStatus,
        lastCheckedAt: new Date(),
        ...(update.lastResponse !== undefined ? { lastResponse: update.lastResponse as Prisma.InputJsonValue } : {}),
      },
    });
    if (outcome === "paid") {
      await transition(payout.billId, "paying", "paid", { actor, detail, data: { paidAt: new Date() }, tx });
    } else if (outcome === "failed") {
      await transition(payout.billId, "paying", "failed", { actor, detail, tx });
    } else if (itemStatus === "REFUNDED") {
      // A refund after payment is logged; the bill stays paid (DECISIONS P0).
      await tx.activityLog.create({ data: { billId: payout.billId, actor, action: "payout_refunded", detail } });
    }
  });
  return outcome;
}
