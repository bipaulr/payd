import type { Actor, BillStatus, Prisma, PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";

export type Tx = Prisma.TransactionClient | PrismaClient;

export interface TransitionOptions {
  actor: Actor;
  /** ActivityLog action; defaults to `status_<to>`. */
  action?: string;
  detail?: Prisma.InputJsonValue;
  /** Extra Bill fields to set in the same conditional update (e.g. paidAt). */
  data?: Prisma.BillUpdateManyMutationInput;
  tx?: Tx;
}

/**
 * The only way a bill changes status (docs/PLAN.md section 2). Conditional
 * update on the current status; returns false when someone else already
 * moved the bill, in which case the caller must stop.
 */
export async function transition(
  billId: string,
  from: BillStatus,
  to: BillStatus,
  opts: TransitionOptions,
): Promise<boolean> {
  const tx = opts.tx ?? db;
  const { count } = await tx.bill.updateMany({
    where: { id: billId, status: from },
    data: { ...opts.data, status: to },
  });
  if (count === 0) return false;
  await tx.activityLog.create({
    data: {
      billId,
      actor: opts.actor,
      action: opts.action ?? `status_${to}`,
      detail: { from, to, ...((opts.detail as Record<string, unknown> | undefined) ?? {}) } as Prisma.InputJsonValue,
    },
  });
  return true;
}
