import { z } from "zod";
import { approveAndPay } from "@/lib/bills/approveAndPay";
import { loadBillDetail } from "@/lib/bills/detail";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.object({
  actorName: z.string().default(""),
  overrideReason: z.string().nullish(),
  /** The amount and PayPal email the owner saw in the confirmation; must still match. */
  confirmAmountCents: z.number().int().optional(),
  confirmPayeeEmail: z.string().nullish(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request body" }, { status: 400 });
  const b = parsed.data;

  const current = await loadBillDetail(id);
  if (!current) return Response.json({ error: "Bill not found" }, { status: 404 });
  if (
    (b.confirmAmountCents !== undefined && b.confirmAmountCents !== current.totalCents) ||
    (b.confirmPayeeEmail !== undefined && (b.confirmPayeeEmail ?? null) !== current.payeeEmail)
  ) {
    return Response.json({ error: "The bill changed since you opened the confirmation. Review it again." }, { status: 409 });
  }

  const res = await approveAndPay(id, { actorName: b.actorName, overrideReason: b.overrideReason });
  const bill = await loadBillDetail(id);
  if (!res.ok) {
    const status = res.stage === "payment" ? 502 : res.reason === "not_reviewable" ? 409 : 400;
    return Response.json({ error: res.message, reason: res.reason, stage: res.stage, bill }, { status });
  }
  return Response.json({ bill });
}
