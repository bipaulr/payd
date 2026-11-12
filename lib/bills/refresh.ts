import type { Payout } from "@prisma/client";
import { db } from "@/lib/db";
import { getPayout } from "@/lib/paypal";
import { applyPayoutStatus } from "./payoutStatus";

/** Ask PayPal for the batch and apply its status. The fallback for late or missing webhooks. */
export async function refreshPayout(payout: Payout): Promise<"paid" | "failed" | "pending"> {
  if (!payout.payoutBatchId) return "pending";
  const batch = await getPayout(payout.payoutBatchId);
  const item = batch.items.find((i) => i.senderItemId === payout.senderItemId) ?? batch.items[0];
  return applyPayoutStatus(
    payout,
    { batchStatus: batch.batchStatus, payoutItemId: item?.payoutItemId, itemStatus: item?.transactionStatus, lastResponse: batch.raw },
    "paypal",
  );
}

const MIN_INTERVAL_MS = 8_000;

/**
 * Refresh bills that are still `paying`, at most once every 8 seconds per
 * bill (docs/PLAN.md section 5.1). Called by the read routes the UI polls, so
 * a bill settles without a webhook. Errors are swallowed: this is best effort.
 */
export async function refreshPaying(billId?: string): Promise<void> {
  const stale = new Date(Date.now() - MIN_INTERVAL_MS);
  const payouts = await db.payout.findMany({
    where: {
      ...(billId ? { billId } : {}),
      bill: { status: "paying" },
      payoutBatchId: { not: null },
      OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: stale } }],
    },
    take: 10,
  });
  await Promise.all(
    payouts.map(async (p) => {
      try {
        // Claim the check first so parallel polls do not all call PayPal.
        const claimed = await db.payout.updateMany({
          where: { id: p.id, OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: stale } }] },
          data: { lastCheckedAt: new Date() },
        });
        if (claimed.count === 1) await refreshPayout(p);
      } catch (err) {
        console.warn(`refresh from PayPal failed for bill ${p.billId}:`, err instanceof Error ? err.message : err);
      }
    }),
  );
}
