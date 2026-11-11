import { centsToValue } from "@/lib/money";

export const usd = (cents: number) => `$${centsToValue(cents).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
export const ymd = (d: Date) => d.toISOString().slice(0, 10);
export const sameDay = (a: Date | null, b: Date | null) => !!a && !!b && ymd(a) === ymd(b);
export const normInvoice = (s: string | null) => (s ?? "").trim().toLowerCase().replace(/\s+/g, "");
export const normEmail = (s: string | null) => (s ?? "").trim().toLowerCase();
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
