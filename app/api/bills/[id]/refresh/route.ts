import { db } from "@/lib/db";
import { loadBillDetail } from "@/lib/bills/detail";
import { refreshPayout } from "@/lib/bills/refresh";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const payout = await db.payout.findUnique({ where: { billId: id } });
  if (!payout) return Response.json({ error: "This bill has no payout yet" }, { status: 404 });
  if (!payout.payoutBatchId) return Response.json({ error: "PayPal has not accepted a batch for this bill yet" }, { status: 409 });
  try {
    await refreshPayout(payout);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
  return Response.json({ bill: await loadBillDetail(id) });
}
