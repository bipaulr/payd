import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { payBill } from "@/lib/bills/payBill";
import { batchBody, cleanup, dbReachable, mockPayPal, seedApprovedBill, type Call } from "./helpers";

const hasDb = await dbReachable();
const billIdOf = (c: Call) => (c.body as { sender_batch_header: { sender_batch_id: string } }).sender_batch_header.sender_batch_id.replace(/^payd-/, "");

describe.skipIf(!hasDb)("payBill (real database, mocked PayPal)", () => {
  afterEach(cleanup);

  it("double pay: two concurrent calls create one payout and one PayPal request", async () => {
    const bill = await seedApprovedBill();
    const batchId = `B-${randomUUID()}`;
    const pp = mockPayPal((c) => (c.method === "POST" ? { status: 201, body: batchBody(batchId, billIdOf(c), "PENDING") } : undefined));

    const results = await Promise.all([payBill(bill.id), payBill(bill.id)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const refused = results.find((r) => !r.ok);
    expect(refused && !refused.ok && refused.reason).toBe("not_approved");
    expect(pp.posts()).toHaveLength(1);
    expect(await db.payout.count({ where: { billId: bill.id } })).toBe(1);

    // A third click after the first finished is refused too.
    const third = await payBill(bill.id);
    expect(third.ok).toBe(false);
    expect(pp.posts()).toHaveLength(1);
    expect((await db.bill.findUniqueOrThrow({ where: { id: bill.id } })).status).toBe("paying");
  });

  it("uses a sender_batch_id and request id derived from the bill id, with integer-cent amounts", async () => {
    const bill = await seedApprovedBill({ totalCents: 20296 });
    const pp = mockPayPal((c) => ({ status: 201, body: batchBody(`B-${randomUUID()}`, billIdOf(c), "PENDING") }));
    await payBill(bill.id);
    const post = pp.posts()[0];
    const body = post.body as { sender_batch_header: { sender_batch_id: string }; items: { amount: { value: string; currency: string }; receiver: string; sender_item_id: string }[] };
    expect(body.sender_batch_header.sender_batch_id).toBe(`payd-${bill.id}`);
    expect(post.headers["paypal-request-id"]).toBe(`payd-${bill.id}`);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ amount: { value: "202.96", currency: "USD" }, receiver: "receiver@test.example", sender_item_id: `bill-${bill.id}` });
    expect(post.url.startsWith("https://api-m.sandbox.paypal.com/")).toBe(true);
  });

  it("retry after a PayPal error resends the same ids and still makes one payout row", async () => {
    const bill = await seedApprovedBill();
    let fail = true;
    const pp = mockPayPal((c) => {
      if (fail) return { status: 503, body: { name: "SERVICE_UNAVAILABLE", message: "try later" } };
      return { status: 201, body: batchBody(`B-${randomUUID()}`, billIdOf(c), "PENDING") };
    });
    const first = await payBill(bill.id);
    expect(first.ok).toBe(false);
    expect(!first.ok && first.reason).toBe("paypal_error");
    expect((await db.bill.findUniqueOrThrow({ where: { id: bill.id } })).status).toBe("approved");

    fail = false;
    const second = await payBill(bill.id);
    expect(second.ok).toBe(true);
    const [a, b] = pp.posts();
    expect(a.headers["paypal-request-id"]).toBe(b.headers["paypal-request-id"]);
    expect(await db.payout.count({ where: { billId: bill.id } })).toBe(1);
  });

  it("when PayPal says the sender_batch_id already exists, follows the link instead of paying again", async () => {
    const bill = await seedApprovedBill();
    const batchId = `B-${randomUUID()}`;
    const pp = mockPayPal((c) => {
      if (c.method === "POST") {
        return { status: 400, body: { name: "USER_BUSINESS_ERROR", message: "Batch with given sender_batch_id already exists", details: [{ link: [{ href: `https://api-m.sandbox.paypal.com/v1/payments/payouts/${batchId}`, rel: "self" }] }] } };
      }
      return { status: 200, body: batchBody(batchId, bill.id, "SUCCESS", "SUCCESS") };
    });
    const res = await payBill(bill.id);
    expect(res.ok && res.batch.duplicate).toBe(true);
    expect(pp.posts()).toHaveLength(1);
    const after = await db.bill.findUniqueOrThrow({ where: { id: bill.id }, include: { payout: true } });
    expect(after.status).toBe("paid");
    expect(after.payout?.payoutBatchId).toBe(batchId);
  });

  it("missing approval: refuses and never calls PayPal", async () => {
    const bill = await seedApprovedBill({ approval: false });
    const pp = mockPayPal(() => undefined);
    const res = await payBill(bill.id);
    expect(res.ok).toBe(false);
    expect(!res.ok && res.reason).toBe("no_approval");
    expect(pp.calls).toHaveLength(0);
    expect(await db.payout.count({ where: { billId: bill.id } })).toBe(0);
  });

  it("refuses a bill that is not in the approved state, even with an approval row", async () => {
    const bill = await seedApprovedBill();
    await db.bill.update({ where: { id: bill.id }, data: { status: "needs_review" } });
    const pp = mockPayPal(() => undefined);
    const res = await payBill(bill.id);
    expect(!res.ok && res.reason).toBe("not_approved");
    expect(pp.calls).toHaveLength(0);
  });

  it("refuses when the bill amount changed after approval", async () => {
    const bill = await seedApprovedBill();
    await db.bill.update({ where: { id: bill.id }, data: { totalCents: 999999 } });
    const pp = mockPayPal(() => undefined);
    const res = await payBill(bill.id);
    expect(!res.ok && res.reason).toBe("snapshot_mismatch");
    expect(pp.calls).toHaveLength(0);
  });
});
