/** Pure name/email normalisers shared by vendor matching and the risk engine. */
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
