import { loadDemo } from "@/lib/demo/load";
import { limited } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Reset, then load five invented vendors with history and five new bills. */
export async function POST(req: Request) {
  const over = limited(req, "demo", 6);
  if (over) return over;
  try {
    return Response.json(await loadDemo());
  } catch (err) {
    console.error("demo load failed", err);
    return Response.json({ error: `Could not load the sample data: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 });
  }
}
