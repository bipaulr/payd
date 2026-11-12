import { handlePayPalWebhook } from "@/lib/bills/webhook";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** PayPal webhook listener. Every delivery is signature-verified before it changes anything. */
export async function POST(req: Request) {
  const res = await handlePayPalWebhook(req);
  return Response.json(res.body, { status: res.status });
}
