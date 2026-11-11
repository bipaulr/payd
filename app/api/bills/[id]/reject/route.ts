import { z } from "zod";
import { recordApproval } from "@/lib/bills/approve";
import { loadBillDetail } from "@/lib/bills/detail";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.object({ actorName: z.string().default(""), reason: z.string().default("") });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request body" }, { status: 400 });
  const res = await recordApproval(id, { decision: "rejected", actorName: parsed.data.actorName, reason: parsed.data.reason });
  if (!res.ok) {
    const status = res.reason === "not_found" ? 404 : res.reason === "not_reviewable" ? 409 : 400;
    return Response.json({ error: res.message, reason: res.reason }, { status });
  }
  return Response.json({ bill: await loadBillDetail(id) });
}
