import { loadBillDetail } from "@/lib/bills/detail";
import { EditSchema, editBill } from "@/lib/bills/edit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const bill = await loadBillDetail(id);
  if (!bill) return Response.json({ error: "Bill not found" }, { status: 404 });
  return Response.json({ bill });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const parsed = EditSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues.map((i) => i.message).join("; ") }, { status: 400 });
  const res = await editBill(id, parsed.data);
  if (!res.ok) return Response.json({ error: res.message }, { status: res.status });
  return Response.json({ bill: await loadBillDetail(id) });
}
