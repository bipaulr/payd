"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/inbox", label: "Inbox" },
  { href: "/ledger", label: "Ledger" },
  { href: "/demo", label: "Demo" },
];

/** The app's one navigation bar. Three destinations, so a bar, not a sidebar. */
export default function Sidebar() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-surface">
      <nav className="container-page flex h-16 items-center gap-8" aria-label="Main">
        <Link href="/" aria-label="payD home" className="display text-xl">
          payD
        </Link>
        <ul className="flex items-center gap-1">
          {items.map((i) => {
            const active = path === i.href || (i.href === "/inbox" && path.startsWith("/bills"));
            return (
              <li key={i.href}>
                <Link
                  href={i.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-11 items-center rounded-(--radius) px-3 text-sm font-semibold ${active ? "bg-accent-soft text-ink" : "text-muted hover:bg-surface-2 hover:text-ink"}`}
                >
                  {i.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
