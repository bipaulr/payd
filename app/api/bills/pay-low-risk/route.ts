import { z } from "zod";
import { db } from "@/lib/db";
import { approveAndPay } from "@/lib/bills/approveAndPay";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.object({ actorName: z.string().default(""), billIds: z.array(z.string()).min(1).max(50) });

/** Approve and pay a confirmed list of bills; anything not low risk and in review is skipped. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Send billIds (1 to 50) and actorName" }, { status: 400 });
  const { actorName, billIds } = parsed.data;
  const results: { billId: string; ok: boolean; message?: string }[] = [];
  for (const billId of [...new Set(billIds)]) {
    const bill = await db.bill.findUnique({ where: { id: billId }, select: { status: true, riskLevel: true } });
    if (!bill || bill.status !== "needs_review" || bill.riskLevel !== "low") {
      results.push({ billId, ok: false, message: "Not a low-risk bill awaiting review" });
      continue;
    }
    const res = await approveAndPay(billId, { actorName });
    results.push(res.ok ? { billId, ok: true } : { billId, ok: false, message: res.message });
  }
  return Response.json({ results });
}
