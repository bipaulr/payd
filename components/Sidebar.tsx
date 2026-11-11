import Link from "next/link";

const items = [
  { href: "/inbox", label: "Inbox" },
  { href: "/ledger", label: "Ledger" },
  { href: "/invoices", label: "Invoices" },
  { href: "/demo", label: "Demo" },
];

export default function Sidebar() {
  return (
    <nav className="w-52 shrink-0 border-r border-zinc-200 p-4">
      <Link href="/" className="mb-6 block text-xl font-semibold">
        payD
      </Link>
      <ul className="space-y-1">
        {items.map((i) => (
          <li key={i.href}>
            <Link href={i.href} className="block rounded px-3 py-2 text-sm hover:bg-zinc-100">
              {i.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
