import { randomUUID } from "node:crypto";
import { Prisma, type Payout } from "@prisma/client";
import { db } from "@/lib/db";
import { getPayout, ITEM_EVENT_STATUS, verifyWebhook } from "@/lib/paypal";
import { applyPayoutStatus } from "./payoutStatus";

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

export interface WebhookResult {
  status: number;
  body: Json;
}

async function findPayout(batchId: string | null, senderBatchId: string | null, senderItemId: string | null): Promise<Payout | null> {
  if (batchId) {
    const p = await db.payout.findUnique({ where: { payoutBatchId: batchId } });
    if (p) return p;
  }
  if (senderBatchId) {
    const p = await db.payout.findUnique({ where: { senderBatchId } });
    if (p) return p;
  }
  if (senderItemId) return db.payout.findFirst({ where: { senderItemId } });
  return null;
}

/** Apply one verified event to its Payout and Bill. Returns a short note for the log. */
async function applyEvent(event: Json): Promise<string> {
  const type = str(event.event_type) ?? "";
  const eventId = str(event.id);
  const resource = obj(event.resource);

  if (type.startsWith("PAYMENT.PAYOUTS-ITEM.")) {
    const batchId = str(resource.payout_batch_id);
    const payout = await findPayout(batchId, str(resource.sender_batch_id), str(obj(resource.payout_item).sender_item_id));
    if (!payout) return "no matching payout";
    const itemStatus = str(resource.transaction_status) ?? ITEM_EVENT_STATUS[type] ?? null;
    await db.activityLog.create({
      data: { billId: payout.billId, actor: "paypal", action: "webhook_received", detail: { eventId, eventType: type, itemStatus } },
    });
    const outcome = await applyPayoutStatus(
      payout,
      { payoutBatchId: batchId, payoutItemId: str(resource.payout_item_id), itemStatus },
      "paypal",
    );
    return `payout ${payout.id}: ${outcome}`;
  }

  if (type.startsWith("PAYMENT.PAYOUTSBATCH.")) {
    const header = obj(resource.batch_header);
    const batchId = str(header.payout_batch_id);
    const payout = await findPayout(batchId, str(obj(header.sender_batch_header).sender_batch_id), null);
    if (!payout) return "no matching payout";
    await db.activityLog.create({
      data: { billId: payout.billId, actor: "paypal", action: "webhook_received", detail: { eventId, eventType: type, batchStatus: str(header.batch_status) } },
    });
    // Batch events carry no item data, so ask PayPal for the item status.
    const id = batchId ?? payout.payoutBatchId;
    if (!id) return "batch event without a batch id";
    const batch = await getPayout(id);
    const item = batch.items.find((i) => i.senderItemId === payout.senderItemId) ?? batch.items[0];
    const outcome = await applyPayoutStatus(
      payout,
      { payoutBatchId: batch.payoutBatchId, batchStatus: batch.batchStatus, payoutItemId: item?.payoutItemId, itemStatus: item?.transactionStatus, lastResponse: batch.raw },
      "paypal",
    );
    return `payout ${payout.id}: ${outcome}`;
  }

  return "event type not handled";
}

/**
 * PayPal webhook delivery (docs/PLAN.md section 4.4): verify the signature,
 * store the event, ignore events already processed, then move the Payout and
 * Bill. An unverified delivery is stored for the audit log and answered 400
 * with no side effects.
 */
export async function handlePayPalWebhook(request: Request): Promise<WebhookResult> {
  const v = await verifyWebhook(request);
  const event = v.event;
  const eventId = event ? str(event.id) : null;
  const eventType = (event && str(event.event_type)) ?? "unknown";
  const resourceType = event ? str(event.resource_type) : null;

  if (!v.verified || !event || !eventId) {
    // Stored under a random key so a forged delivery can never occupy a real event id.
    await db.webhookEvent
      .create({
        data: {
          paypalEventId: `unverified:${randomUUID()}`,
          eventType,
          resourceType,
          verificationStatus: v.verified ? "NO_EVENT_ID" : v.verificationStatus,
          headers: v.headers as Prisma.InputJsonValue,
          payload: (event ?? {}) as Prisma.InputJsonValue,
          error: "signature not verified; ignored",
        },
      })
      .catch((err: unknown) => console.error("could not store unverified webhook", err));
    return { status: 400, body: { error: "Webhook signature could not be verified", verificationStatus: v.verificationStatus } };
  }

  try {
    await db.webhookEvent.create({
      data: {
        paypalEventId: eventId,
        eventType,
        resourceType,
        verificationStatus: v.verificationStatus,
        headers: v.headers as Prisma.InputJsonValue,
        payload: event as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
    const existing = await db.webhookEvent.findUnique({ where: { paypalEventId: eventId } });
    // Replay of an event we already handled: acknowledge and do nothing.
    if (existing?.processedAt) return { status: 200, body: { received: true, duplicate: true } };
    // Stored earlier but processing failed: fall through and process again (it is idempotent).
  }

  try {
    const note = await applyEvent(event);
    await db.webhookEvent.update({ where: { paypalEventId: eventId }, data: { processedAt: new Date(), error: null } });
    return { status: 200, body: { received: true, duplicate: false, note } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.webhookEvent.update({ where: { paypalEventId: eventId }, data: { error: message } });
    // 500 makes PayPal retry the delivery; the event stays unprocessed until then.
    return { status: 500, body: { error: "Stored but not processed; PayPal will retry" } };
  }
}
