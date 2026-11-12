import { db } from "@/lib/db";
import { receiverEmailFor } from "./approve";

/** Everything the bill page shows, without the file bytes. */
export async function loadBillDetail(id: string) {
  const bill = await db.bill.findUnique({
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
  if (!bill) return null;
  // The sandbox account a payout would go to, shown in the confirmation before approving.
  return { ...bill, receiverEmail: bill.payout?.receiverEmail ?? receiverEmailFor(bill.vendor) };
}
