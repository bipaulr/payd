import { randomUUID } from "node:crypto";
import { vi } from "vitest";
import { db } from "@/lib/db";
import { clearTokenCache } from "@/lib/paypal";

/** These tests use the real Postgres from DATABASE_URL and a mocked PayPal (global fetch). */
export async function dbReachable(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  try {
    await db.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

export interface Call {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

type Reply = { status: number; body: unknown };
export type Handler = (call: Call) => Reply | undefined | Promise<Reply | undefined>;

/** Replace global fetch with a fake PayPal. The OAuth call is always answered. */
export function mockPayPal(handler: Handler) {
  const calls: Call[] = [];
  vi.stubEnv("PAYPAL_ENV", "sandbox");
  vi.stubEnv("PAYPAL_CLIENT_ID", "test-client");
  vi.stubEnv("PAYPAL_CLIENT_SECRET", "test-secret");
  vi.stubEnv("PAYPAL_WEBHOOK_ID", "WH-TEST");
  clearTokenCache();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
      let body: unknown = init?.body;
      if (typeof body === "string") {
        try {
          body = JSON.parse(body);
        } catch {
          // form-encoded OAuth body stays a string
        }
      }
      const call: Call = { method: init?.method ?? "GET", url, headers, body };
      const json = (r: Reply) => new Response(JSON.stringify(r.body), { status: r.status, headers: { "Content-Type": "application/json" } });
      if (url.endsWith("/v1/oauth2/token")) return json({ status: 200, body: { access_token: "tok", expires_in: 3600 } });
      calls.push(call);
      const reply = await handler(call);
      if (!reply) throw new Error(`unexpected PayPal call ${call.method} ${url}`);
      return json(reply);
    }),
  );
  return { calls, posts: () => calls.filter((c) => c.method === "POST" && c.url.endsWith("/v1/payments/payouts")) };
}

export const batchBody = (batchId: string, billId: string, batchStatus: string, itemStatus?: string) => ({
  batch_header: { payout_batch_id: batchId, batch_status: batchStatus, sender_batch_header: { sender_batch_id: `payd-${billId}` } },
  ...(itemStatus
    ? { items: [{ payout_item_id: `ITEM-${batchId}`, transaction_status: itemStatus, payout_item: { sender_item_id: `bill-${billId}` } }] }
    : {}),
});

const created: string[] = [];
const createdEvents: string[] = [];

/** A fresh event id, removed again by cleanup(). Only this file's ids are cleaned, so parallel test files do not collide. */
export function newEventId(): string {
  const id = `WH-TEST-${randomUUID()}`;
  createdEvents.push(id);
  return id;
}

/** A bill in `approved` with (or without) a recorded human approval. */
export async function seedApprovedBill(opts: { approval?: boolean; totalCents?: number } = {}) {
  const totalCents = opts.totalCents ?? 12345;
  const bill = await db.bill.create({
    data: {
      fileName: "test.pdf",
      mimeType: "application/pdf",
      fileBytes: Buffer.from("%PDF-test"),
      fileSha256: `test-${randomUUID()}`,
      status: "approved",
      totalCents,
      payeeEmail: "vendor@test.example",
      riskLevel: "low",
      invoiceNumber: "T-1",
    },
  });
  created.push(bill.id);
  if (opts.approval !== false) {
    await db.approval.create({
      data: { billId: bill.id, decision: "approved", actorName: "Test Owner", amountCents: totalCents, payeeEmail: "vendor@test.example", receiverEmail: "receiver@test.example", riskLevel: "low" },
    });
  }
  return bill;
}

export async function cleanup() {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  const events = createdEvents.splice(0);
  for (const id of events) {
    await db.webhookEvent.deleteMany({ where: { OR: [{ paypalEventId: id }, { paypalEventId: { startsWith: "unverified:" }, payload: { path: ["id"], equals: id } }] } });
  }
  const ids = created.splice(0);
  if (ids.length === 0) return;
  await db.payout.deleteMany({ where: { billId: { in: ids } } });
  await db.bill.deleteMany({ where: { id: { in: ids } } });
}

export function webhookRequest(event: Record<string, unknown>, opts: { headers?: boolean } = {}) {
  return new Request("http://localhost/api/webhooks/paypal", {
    method: "POST",
    headers:
      opts.headers === false
        ? { "Content-Type": "application/json" }
        : {
            "Content-Type": "application/json",
            "paypal-auth-algo": "SHA256withRSA",
            "paypal-cert-url": "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-TEST",
            "paypal-transmission-id": "tx-1",
            "paypal-transmission-sig": "sig",
            "paypal-transmission-time": "2026-11-12T10:00:00Z",
          },
    body: JSON.stringify(event),
  });
}

export const itemEvent = (billId: string, batchId: string, eventId = newEventId()) => ({
  id: eventId,
  test: true,
  event_type: "PAYMENT.PAYOUTS-ITEM.SUCCEEDED",
  resource_type: "payouts_item",
  resource: {
    payout_item_id: `ITEM-${batchId}`,
    transaction_status: "SUCCESS",
    payout_batch_id: batchId,
    sender_batch_id: `payd-${billId}`,
    payout_item: { sender_item_id: `bill-${billId}` },
  },
});
