import { resetDemo } from "@/lib/demo/load";
import { limited } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Delete all bills, vendors and payouts. Webhook events and the extraction cache are kept. */
export async function POST(req: Request) {
  const over = limited(req, "demo", 6);
  if (over) return over;
  try {
    await resetDemo();
    return Response.json({ ok: true });
  } catch (err) {
    console.error("demo reset failed", err);
    return Response.json({ error: "Could not reset the data." }, { status: 500 });
  }
}
