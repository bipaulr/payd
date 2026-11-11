import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { valueToCents } from "@/lib/money";
import { normalizeEmail } from "./normalize";
import { runRiskEngine } from "./risk";

const text = z.string().trim().max(500).nullable();
const money = z.string().trim().regex(/^\d+(\.\d{1,2})?$/, "Use a decimal amount like 1234.50").nullable();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").nullable();

export const EditSchema = z
  .object({
    vendorName: text,
    payeeEmail: z.email().nullable(),
    invoiceNumber: text,
    issueDate: day,
    dueDate: day,
    subtotal: money,
    tax: money,
    total: money,
    paymentInstructions: z.string().max(2000).nullable(),
  })
  .partial()
  .strict();

export type EditInput = z.infer<typeof EditSchema>;
export type EditResult = { ok: true } | { ok: false; status: number; message: string };

const toDate = (v: string) => {
  const d = new Date(`${v}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new Error(`invalid date ${v}`);
  return d;
};

/** Owner edits a field while the bill is in needs_review; the risk engine re-runs. */
export async function editBill(billId: string, input: EditInput): Promise<EditResult> {
  const data: Prisma.BillUpdateManyMutationInput = {};
  try {
    if ("vendorName" in input) data.proposedVendorName = input.vendorName;
    if ("payeeEmail" in input) data.payeeEmail = input.payeeEmail ? normalizeEmail(input.payeeEmail) : null;
    if ("invoiceNumber" in input) data.invoiceNumber = input.invoiceNumber;
    if ("issueDate" in input) data.issueDate = input.issueDate ? toDate(input.issueDate) : null;
    if ("dueDate" in input) data.dueDate = input.dueDate ? toDate(input.dueDate) : null;
    if ("subtotal" in input) data.subtotalCents = input.subtotal ? valueToCents(input.subtotal) : null;
    if ("tax" in input) data.taxCents = input.tax ? valueToCents(input.tax) : null;
    if ("total" in input) data.totalCents = input.total ? valueToCents(input.total) : null;
    if ("paymentInstructions" in input) data.paymentInstructions = input.paymentInstructions;
  } catch (err) {
    return { ok: false, status: 400, message: (err as Error).message };
  }
  if (Object.keys(data).length === 0) return { ok: false, status: 400, message: "No fields to change" };

  const bill = await db.bill.findUnique({ where: { id: billId }, select: { vendorId: true } });
  if (!bill) return { ok: false, status: 404, message: "Bill not found" };
  // A confirmed vendor keeps its record name; only proposed names are editable here.
  if (bill.vendorId) delete data.proposedVendorName;

  const { count } = await db.bill.updateMany({ where: { id: billId, status: "needs_review" }, data });
  if (count === 0) return { ok: false, status: 409, message: "Bill is no longer awaiting review" };
  await db.activityLog.create({ data: { billId, actor: "user", action: "edited", detail: { fields: Object.keys(input) } } });
  await runRiskEngine(billId);
  return { ok: true };
}
