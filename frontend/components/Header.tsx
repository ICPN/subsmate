"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Header a tutta larghezza in Ink Navy, come nel riferimento ICPN (§5). */

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/abbonamenti", label: "Abbonamenti" },
  { href: "/persone", label: "Persone" },
  { href: "/servizi", label: "Servizi" },
  { href: "/pagamenti", label: "Pagamenti" },
];

export function Header() {
  const pathname = usePathname();

  return (
    <header className="bg-[var(--ink-navy)] text-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-3 px-6 py-4">
        <Link
          href="/"
          className="font-[family-name:var(--font-manrope)] text-lg font-bold tracking-tight"
        >
          SubsMate
        </Link>

        <nav aria-label="Navigazione principale" className="flex-1">
          <ul className="flex flex-wrap gap-x-6 gap-y-1">
            {LINKS.map((link) => {
              const active =
                link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    className={
                      active
                        ? "border-b-2 border-white pb-0.5 text-sm font-medium text-white"
                        : "pb-0.5 text-sm text-white/70 transition-colors hover:text-white"
                    }
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <span className="text-xs text-white/60">Area amministratori</span>
      </div>
    </header>
  );
}
