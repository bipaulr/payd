import { loadBillDetail } from "@/lib/bills/detail";
import { payBill } from "@/lib/bills/payBill";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const res = await payBill(id);
  const bill = await loadBillDetail(id);
  if (!res.ok) {
    const status = res.reason === "not_found" ? 404 : res.reason === "paypal_error" ? 502 : 409;
    return Response.json({ error: res.message, reason: res.reason, bill }, { status });
  }
  return Response.json({ bill });
}
