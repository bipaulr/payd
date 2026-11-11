import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const bill = await db.bill.findUnique({ where: { id }, select: { fileBytes: true, mimeType: true, fileName: true } });
  if (!bill) return Response.json({ error: "Bill not found" }, { status: 404 });
  return new Response(new Uint8Array(bill.fileBytes), {
    headers: {
      "Content-Type": bill.mimeType,
      "Content-Disposition": `inline; filename="${bill.fileName.replace(/[^\w.\- ]/g, "_")}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
