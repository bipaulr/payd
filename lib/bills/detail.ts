import { db } from "@/lib/db";

/** Everything the bill page shows, without the file bytes. */
export async function loadBillDetail(id: string) {
  return db.bill.findUnique({
    where: { id },
    omit: { fileBytes: true, rawModelOutput: true },
    include: {
      vendor: true,
      lineItems: { orderBy: { position: "asc" } },
      riskFlags: { orderBy: { createdAt: "asc" } },
      approvals: { orderBy: { createdAt: "desc" } },
      payout: { omit: { lastResponse: true } },
      activity: { orderBy: { createdAt: "asc" } },
    },
  });
}
