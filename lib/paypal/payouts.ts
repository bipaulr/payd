import { centsToValue } from "@/lib/money";
import { PAYPAL_API_BASE, PayPalError, readJson } from "./config";
import { getAccessToken } from "./token";

// Docs: https://developer.paypal.com/api/payments.payouts-batch/v1/payouts-post
//       https://developer.paypal.com/api/payments.payouts-batch/v1/payouts-get

export const senderBatchIdFor = (billId: string) => `payd-${billId}`;
export const senderItemIdFor = (billId: string) => `bill-${billId}`;

export interface PayoutRequest {
  /** Bill id; the sender_batch_id and PayPal-Request-Id are derived from it. */
  id: string;
  amountCents: number;
  receiverEmail: string;
  invoiceNumber?: string | null;
}

export interface PayoutItemStatus {
  payoutItemId: string | null;
  transactionStatus: string | null;
  senderItemId: string | null;
  errorName: string | null;
}

export interface PayoutBatch {
  payoutBatchId: string;
  batchStatus: string | null;
  senderBatchId: string | null;
  items: PayoutItemStatus[];
  /** true when PayPal said this sender_batch_id was already used and we followed its link. */
  duplicate: boolean;
  raw: unknown;
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" ? (v as Json) : {});
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

function parseBatch(body: unknown, duplicate = false): PayoutBatch {
  const header = obj(obj(body).batch_header);
  const payoutBatchId = str(header.payout_batch_id);
  if (!payoutBatchId) throw new PayPalError("PayPal response has no payout_batch_id", 0, body);
  const rawItems = Array.isArray(obj(body).items) ? (obj(body).items as unknown[]) : [];
  return {
    payoutBatchId,
    batchStatus: str(header.batch_status),
    senderBatchId: str(obj(header.sender_batch_header).sender_batch_id),
    items: rawItems.map((i) => {
      const item = obj(i);
      return {
        payoutItemId: str(item.payout_item_id),
        transactionStatus: str(item.transaction_status),
        senderItemId: str(obj(item.payout_item).sender_item_id),
        errorName: str(obj(item.errors).name),
      };
    }),
    duplicate,
    raw: body,
  };
}

const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/**
 * Payout batch id from a HATEOAS link like .../v1/payments/payouts/<id>, if any.
 * Sandbox puts it in details[].link on USER_BUSINESS_ERROR "Batch with given
 * sender_batch_id already exists" (seen 2026-11-11); top-level links also checked.
 */
function linkedBatchId(body: unknown): string | null {
  const b = obj(body);
  const links = [...arr(b.links), ...arr(b.details).flatMap((d) => [...arr(obj(d).link), ...arr(obj(d).links)])];
  for (const l of links) {
    const m = /\/v1\/payments\/payouts\/([^/?#]+)/.exec(str(obj(l).href) ?? "");
    if (m) return decodeURIComponent(m[1]);
  }
  return null;
}

/**
 * One payout item for one bill. sender_batch_id and PayPal-Request-Id are both
 * `payd-<billId>`, so a retry can never pay twice: PayPal replays the stored
 * response for the same request id, and rejects a reused sender_batch_id with
 * a link to the original batch, which we follow.
 */
export async function createPayout(bill: PayoutRequest): Promise<PayoutBatch> {
  if (!Number.isSafeInteger(bill.amountCents) || bill.amountCents <= 0) {
    throw new Error(`amountCents must be a positive integer, got ${bill.amountCents}`);
  }
  const senderBatchId = senderBatchIdFor(bill.id);
  const token = await getAccessToken();
  const res = await fetch(`${PAYPAL_API_BASE}/v1/payments/payouts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": senderBatchId,
    },
    body: JSON.stringify({
      sender_batch_header: {
        sender_batch_id: senderBatchId,
        recipient_type: "EMAIL",
        email_subject: "You have a payment from payD",
        email_message: bill.invoiceNumber ? `Payment for invoice ${bill.invoiceNumber}` : "Payment for your bill",
      },
      items: [
        {
          recipient_type: "EMAIL",
          amount: { value: centsToValue(bill.amountCents), currency: "USD" },
          receiver: bill.receiverEmail,
          sender_item_id: senderItemIdFor(bill.id),
          note: bill.invoiceNumber ? `Invoice ${bill.invoiceNumber}` : `payD bill ${bill.id}`,
        },
      ],
    }),
  });
  const body = await readJson(res);
  if (res.ok) return parseBatch(body);
  const existing = res.status >= 400 && res.status < 500 ? linkedBatchId(body) : null;
  if (existing) return { ...(await getPayout(existing)), duplicate: true };
  const b = obj(body);
  throw new PayPalError(
    `PayPal create payout failed (${res.status}) ${str(b.name) ?? ""}: ${str(b.message) ?? ""}`.trim(),
    res.status,
    body,
  );
}

/** Current batch and item status. Fallback for late or missing webhooks. */
export async function getPayout(payoutBatchId: string): Promise<PayoutBatch> {
  const token = await getAccessToken();
  const res = await fetch(`${PAYPAL_API_BASE}/v1/payments/payouts/${encodeURIComponent(payoutBatchId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await readJson(res);
  if (!res.ok) throw new PayPalError(`PayPal get payout failed (${res.status})`, res.status, body);
  return parseBatch(body);
}
