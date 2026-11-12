import { loadBillDetail } from "@/lib/bills/detail";
import { retryExtraction } from "@/lib/bills/ingest";
import { limited } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Read the file again after a failed extraction (model outage, quota, timeout). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const over = limited(req, "upload", 12);
  if (over) return over;
  const { id } = await ctx.params;
  const res = await retryExtraction(id);
  const bill = await loadBillDetail(id);
  if (!res.ok) return Response.json({ error: res.message, bill }, { status: res.status });
  return Response.json({ bill });
}
