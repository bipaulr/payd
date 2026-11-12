import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { payBill } from "@/lib/bills/payBill";
import { handlePayPalWebhook } from "@/lib/bills/webhook";
import { verifyWebhook } from "@/lib/paypal";
import { batchBody, cleanup, dbReachable, itemEvent, mockPayPal, newEventId, seedApprovedBill, webhookRequest } from "./helpers";

const hasDb = await dbReachable();
const VERIFY = "/v1/notifications/verify-webhook-signature";

/** A bill in `paying` with an accepted batch, plus a fake PayPal that answers verification. */
async function payingBill(verification: string) {
  const bill = await seedApprovedBill();
  const batchId = `B-${randomUUID()}`;
  const pp = mockPayPal((c) => {
    if (c.url.endsWith(VERIFY)) return { status: 200, body: { verification_status: verification } };
    if (c.method === "POST") return { status: 201, body: batchBody(batchId, bill.id, "PENDING") };
    return { status: 200, body: batchBody(batchId, bill.id, "SUCCESS", "SUCCESS") };
  });
  const paid = await payBill(bill.id);
  expect(paid.ok).toBe(true);
  return { bill, batchId, pp };
}

describe.skipIf(!hasDb)("PayPal webhook (real database, mocked PayPal)", () => {
  afterEach(cleanup);

  it("a verified PAYOUTS-ITEM.SUCCEEDED event marks the bill paid", async () => {
    const { bill, batchId, pp } = await payingBill("SUCCESS");
    const event = itemEvent(bill.id, batchId);
    const res = await handlePayPalWebhook(webhookRequest(event));
    expect(res.status).toBe(200);

    const verify = pp.calls.find((c) => c.url.endsWith(VERIFY));
    expect(verify?.body).toMatchObject({ webhook_id: "WH-TEST", transmission_id: "tx-1", auth_algo: "SHA256withRSA", webhook_event: { id: event.id } });

    const after = await db.bill.findUniqueOrThrow({ where: { id: bill.id }, include: { payout: true } });
    expect(after.status).toBe("paid");
    expect(after.paidAt).not.toBeNull();
    expect(after.payout?.itemStatus).toBe("SUCCESS");
    const stored = await db.webhookEvent.findUniqueOrThrow({ where: { paypalEventId: event.id } });
    expect(stored.verificationStatus).toBe("SUCCESS");
    expect(stored.processedAt).not.toBeNull();
  });

  it("replayed webhook: the second delivery is ignored", async () => {
    const { bill, batchId } = await payingBill("SUCCESS");
    const event = itemEvent(bill.id, batchId);
    const first = await handlePayPalWebhook(webhookRequest(event));
    const second = await handlePayPalWebhook(webhookRequest(event));
    expect(first.body.duplicate).toBe(false);
    expect(second.status).toBe(200);
    expect(second.body.duplicate).toBe(true);
    expect(await db.webhookEvent.count({ where: { paypalEventId: event.id } })).toBe(1);
    expect(await db.activityLog.count({ where: { billId: bill.id, action: "webhook_received" } })).toBe(1);
    expect(await db.activityLog.count({ where: { billId: bill.id, action: "status_paid" } })).toBe(1);
    expect(await db.payout.count({ where: { billId: bill.id } })).toBe(1);
  });

  it("bad signature: answered 400 and the bill does not move", async () => {
    const { bill, batchId } = await payingBill("FAILURE");
    const event = itemEvent(bill.id, batchId);
    const res = await handlePayPalWebhook(webhookRequest(event));
    expect(res.status).toBe(400);
    expect((await db.bill.findUniqueOrThrow({ where: { id: bill.id } })).status).toBe("paying");
    // The forged delivery does not occupy the real event id.
    expect(await db.webhookEvent.count({ where: { paypalEventId: event.id } })).toBe(0);
    expect(await db.activityLog.count({ where: { billId: bill.id, action: "webhook_received" } })).toBe(0);
  });

  it("missing signature headers: rejected without asking PayPal", async () => {
    const { bill, batchId, pp } = await payingBill("SUCCESS");
    const res = await handlePayPalWebhook(webhookRequest(itemEvent(bill.id, batchId), { headers: false }));
    expect(res.status).toBe(400);
    expect(res.body.verificationStatus).toBe("MISSING_HEADERS");
    expect(pp.calls.some((c) => c.url.endsWith(VERIFY))).toBe(false);
    expect((await db.bill.findUniqueOrThrow({ where: { id: bill.id } })).status).toBe("paying");
  });

  it("a batch event fetches the item status from PayPal", async () => {
    const { bill, batchId } = await payingBill("SUCCESS");
    const event = {
      id: newEventId(),
      event_type: "PAYMENT.PAYOUTSBATCH.SUCCESS",
      resource_type: "payouts",
      resource: { batch_header: { payout_batch_id: batchId, batch_status: "SUCCESS", sender_batch_header: { sender_batch_id: `payd-${bill.id}` } } },
    };
    const res = await handlePayPalWebhook(webhookRequest(event));
    expect(res.status).toBe(200);
    expect((await db.bill.findUniqueOrThrow({ where: { id: bill.id } })).status).toBe("paid");
  });
});

describe("verifyWebhook", () => {
  afterEach(cleanup);

  it("is unverified with no PAYPAL_WEBHOOK_ID", async () => {
    mockPayPal(() => undefined);
    process.env.PAYPAL_WEBHOOK_ID = "";
    const v = await verifyWebhook(webhookRequest({ id: "x", event_type: "PAYMENT.PAYOUTS-ITEM.SUCCEEDED" }));
    expect(v).toMatchObject({ verified: false, verificationStatus: "NO_WEBHOOK_ID" });
  });

  it("is unverified when the body is not JSON or PayPal errors", async () => {
    mockPayPal(() => ({ status: 500, body: {} }));
    const notJson = new Request("http://localhost/x", { method: "POST", body: "not json" });
    expect((await verifyWebhook(notJson)).verificationStatus).toBe("INVALID_JSON");
    const v = await verifyWebhook(webhookRequest({ id: "x" }));
    expect(v).toMatchObject({ verified: false, verificationStatus: "VERIFY_HTTP_500" });
  });
});
