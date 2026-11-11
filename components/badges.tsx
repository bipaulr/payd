export const usd = (cents: number | null | undefined) =>
  cents == null ? "-" : `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : "-");

const RISK: Record<string, string> = {
  low: "bg-green-100 text-green-800",
  medium: "bg-amber-100 text-amber-900",
  high: "bg-red-100 text-red-800",
};

export function RiskBadge({ level }: { level: string | null }) {
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${level ? RISK[level] : "bg-zinc-100 text-zinc-600"}`}>
      {level ? `${level} risk` : "not assessed"}
    </span>
  );
}

const STATUS: Record<string, string> = {
  paid: "bg-green-100 text-green-800",
  paying: "bg-blue-100 text-blue-800",
  failed: "bg-red-100 text-red-800",
  rejected: "bg-zinc-200 text-zinc-700",
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS[status] ?? "bg-zinc-100 text-zinc-700"}`}>{status.replace("_", " ")}</span>;
}
