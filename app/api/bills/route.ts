import { db } from "@/lib/db";
import { ALLOWED_MIME, ingestUpload, MAX_UPLOAD_BYTES, publicBill, sniffMime } from "@/lib/bills/ingest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bad = (status: number, error: string) => Response.json({ error }, { status });

export async function POST(req: Request) {
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

  const { bill, duplicate } = await ingestUpload({ bytes, fileName: file.name || "upload", mimeType });
  return Response.json({ bill: publicBill(bill), duplicate }, { status: duplicate ? 200 : 201 });
}

export async function GET() {
  const bills = await db.bill.findMany({
    omit: { fileBytes: true },
    include: { vendor: true },
    orderBy: { createdAt: "desc" },
  });
  return Response.json({ bills });
}
