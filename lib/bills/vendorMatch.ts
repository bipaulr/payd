import type { Vendor } from "@prisma/client";
import type { Tx } from "./transition";
import { db } from "@/lib/db";

const SUFFIXES = new Set(["inc", "incorporated", "llc", "ltd", "limited", "co", "corp", "corporation", "company", "plc", "gmbh", "the"]);

/** "The Acme Supply Co., Inc." -> "acme supply" */
export function normalizeVendorName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w && !SUFFIXES.has(w))
    .join(" ");
}

export const normalizeEmail = (e: string) => e.trim().toLowerCase();

export type VendorMatch =
  | { kind: "matched"; vendor: Vendor; by: "email" | "name" }
  | { kind: "proposed"; name: string | null; email: string | null }
  | { kind: "none" };

/**
 * Match an extracted vendor to an existing Vendor: first by printed payee
 * email, then by normalised name. With no match, a proposal is returned for a
 * human to confirm; this never creates a Vendor.
 */
export async function matchVendor(
  name: string | null,
  email: string | null,
  tx: Tx = db,
): Promise<VendorMatch> {
  const em = email ? normalizeEmail(email) : null;
  const norm = name ? normalizeVendorName(name) : "";
  if (em) {
    const byEmail = await tx.vendor.findFirst({ where: { paypalEmail: { equals: em, mode: "insensitive" } }, orderBy: { createdAt: "asc" } });
    if (byEmail) return { kind: "matched", vendor: byEmail, by: "email" };
  }
  if (norm) {
    const byName = await tx.vendor.findFirst({ where: { normalizedName: norm }, orderBy: { createdAt: "asc" } });
    if (byName) return { kind: "matched", vendor: byName, by: "name" };
  }
  if (!name && !em) return { kind: "none" };
  return { kind: "proposed", name: name?.trim() || null, email: em };
}
