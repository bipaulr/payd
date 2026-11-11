/**
 * Sandbox payout smoke test: sends $1.00 to PAYOUT_SMOKE_EMAIL, then polls
 * getPayout until the batch settles or 60 seconds pass.
 * Run: npm run smoke:payout
 * Exit code 0 only when the payout item reaches SUCCESS.
 */
import "dotenv/config";
import { createPayout, getPayout, PayPalError } from "@/lib/paypal";
import type { PayoutBatch } from "@/lib/paypal";

const SETTLED_BATCH = new Set(["SUCCESS", "DENIED", "CANCELED"]);
const PENDING_ITEM = new Set(["PENDING", null]);

function summary(b: PayoutBatch): string {
  const item = b.items[0];
  return `batch_status=${b.batchStatus} item=${item?.payoutItemId ?? "-"} transaction_status=${item?.transactionStatus ?? "-"}`;
}

async function main(): Promise<number> {
  const receiver = process.env.PAYOUT_SMOKE_EMAIL;
  if (!receiver) {
    console.error("PAYOUT_SMOKE_EMAIL is not set");
    return 2;
  }
  // Not a bill: a unique id per run so each smoke run is its own batch.
  const id = `smoke-${Date.now()}`;
  console.log(`Creating sandbox payout of 1.00 USD to ${receiver} (sender_batch_id payd-${id})`);
  const created = await createPayout({ id, amountCents: 100, receiverEmail: receiver, invoiceNumber: "SMOKE" });
  console.log(`Created payout_batch_id=${created.payoutBatchId} batch_status=${created.batchStatus}`);

  const deadline = Date.now() + 60_000;
  let latest = created;
  for (;;) {
    latest = await getPayout(created.payoutBatchId);
    console.log(`[${new Date().toISOString()}] ${summary(latest)}`);
    const itemStatus = latest.items[0]?.transactionStatus ?? null;
    const settled =
      latest.batchStatus !== null && SETTLED_BATCH.has(latest.batchStatus) && !PENDING_ITEM.has(itemStatus);
    if (settled || Date.now() >= deadline) break;
    await new Promise((r) => setTimeout(r, 5_000));
  }

  const ok = latest.items[0]?.transactionStatus === "SUCCESS";
  console.log(`\nRESULT ${ok ? "SUCCESS" : "NOT SETTLED"}: payout_batch_id=${latest.payoutBatchId} ${summary(latest)}`);
  if (process.env.SMOKE_SHOW_RAW) console.log(JSON.stringify(latest.raw, null, 2));
  return ok ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    if (err instanceof PayPalError) {
      console.error(`${err.message}\nHTTP ${err.status}\n${JSON.stringify(err.body, null, 2)}`);
    } else {
      console.error(err);
    }
    process.exit(1);
  },
);
