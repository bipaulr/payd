/** Bill outcome implied by PayPal payout statuses (docs/PLAN.md section 2). */
export type PayoutOutcome = "paid" | "failed" | "pending";

const FAILED_ITEM = new Set(["FAILED", "BLOCKED", "CANCELED", "RETURNED"]);
const FAILED_BATCH = new Set(["DENIED", "CANCELED"]);

export function payoutOutcome(batchStatus: string | null, itemStatus: string | null): PayoutOutcome {
  if (itemStatus === "SUCCESS") return "paid";
  if (itemStatus && FAILED_ITEM.has(itemStatus)) return "failed";
  if (batchStatus && FAILED_BATCH.has(batchStatus)) return "failed";
  // PENDING, PROCESSING, UNCLAIMED, ONHOLD, REFUNDED (logged on a paid bill), unknown
  return "pending";
}

/** Item transaction_status implied by a PAYMENT.PAYOUTS-ITEM.* event name. */
export const ITEM_EVENT_STATUS: Record<string, string> = {
  "PAYMENT.PAYOUTS-ITEM.SUCCEEDED": "SUCCESS",
  "PAYMENT.PAYOUTS-ITEM.FAILED": "FAILED",
  "PAYMENT.PAYOUTS-ITEM.BLOCKED": "BLOCKED",
  "PAYMENT.PAYOUTS-ITEM.CANCELED": "CANCELED",
  "PAYMENT.PAYOUTS-ITEM.HELD": "ONHOLD",
  "PAYMENT.PAYOUTS-ITEM.REFUNDED": "REFUNDED",
  "PAYMENT.PAYOUTS-ITEM.RETURNED": "RETURNED",
  "PAYMENT.PAYOUTS-ITEM.UNCLAIMED": "UNCLAIMED",
};
