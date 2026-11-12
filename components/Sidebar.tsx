"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/inbox", label: "Inbox", hint: "Bills to review and pay" },
  { href: "/ledger", label: "Ledger", hint: "Every bill, in one grid" },
  { href: "/demo", label: "Demo", hint: "Load sample data" },
];

export default function Sidebar() {
  const path = usePathname();
  return (
    <nav className="flex w-56 shrink-0 flex-col border-r border-line bg-surface px-3 py-5" aria-label="Main">
      <Link href="/" className="mb-7 flex items-baseline gap-2 px-3">
        <span className="text-xl font-semibold tracking-tight">
          pay<span className="text-accent">D</span>
        </span>
        <span className="text-xs text-muted">finance clerk</span>
      </Link>
      <ul className="space-y-1">
        {items.map((i) => {
          const active = path === i.href || (i.href === "/inbox" && path.startsWith("/bills"));
          return (
            <li key={i.href}>
              <Link
                href={i.href}
                aria-current={active ? "page" : undefined}
                className={`block rounded-md px-3 py-2 text-sm ${active ? "bg-surface-2 font-semibold text-ink" : "text-muted hover:bg-surface-2 hover:text-ink"}`}
              >
                {i.label}
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mt-auto px-3 text-xs leading-5 text-muted">
        Payments run in the PayPal sandbox. Nothing is paid without a recorded human approval.
      </p>
    </nav>
  );
}
