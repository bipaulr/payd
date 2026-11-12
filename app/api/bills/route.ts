import { db } from "@/lib/db";
import { limited } from "@/lib/ratelimit";
import { refreshPaying } from "@/lib/bills/refresh";
import { ALLOWED_MIME, ingestUpload, MAX_UPLOAD_BYTES, publicBill, sniffMime } from "@/lib/bills/ingest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bad = (status: number, error: string) => Response.json({ error }, { status });

export async function POST(req: Request) {
  const over = limited(req, "upload", 12);
  if (over) return over;
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return bad(400, "Expected multipart/form-data with a 'file' field.");
  }
  const files = form.getAll("file").filter((f): f is File => typeof f !== "string");
  if (files.length !== 1) return bad(400, "Upload exactly one file in the 'file' field.");
  const file = files[0];
  if (file.size === 0) return bad(400, "The file is empty.");
  if (file.size > MAX_UPLOAD_BYTES) return bad(413, "The file is larger than 5 MB.");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mimeType = sniffMime(bytes);
  if (!mimeType) return bad(415, `Only ${ALLOWED_MIME.join(", ")} files are accepted.`);

  let outcome;
  try {
    outcome = await ingestUpload({ bytes, fileName: file.name || "upload", mimeType });
  } catch (err) {
    console.error("upload failed", err);
    return bad(500, "The bill could not be saved. Try again.");
  }
  const { bill, duplicate } = outcome;
  return Response.json({ bill: publicBill(bill), duplicate }, { status: duplicate ? 200 : 201 });
}

export async function GET() {
  await refreshPaying();
  const bills = await db.bill.findMany({
    omit: { fileBytes: true, rawModelOutput: true, extraction: true },
    include: { vendor: true, payout: { select: { payoutBatchId: true, batchStatus: true, itemStatus: true, receiverEmail: true } }, riskFlags: { select: { check: true, severity: true } } },
    orderBy: { createdAt: "desc" },
  });
  return Response.json({ bills });
}
