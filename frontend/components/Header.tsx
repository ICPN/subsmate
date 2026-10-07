"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

/**
 * Header a tutta larghezza in Ink Navy, come nel riferimento ICPN (§5).
 *
 * Da 768px in su le voci stanno in riga. Sotto, il bottone mostra la pagina in
 * cui ci si trova e apre un menu a tendina sovrapposto al contenuto: per questo
 * è l'unico punto dell'header con un'ombra (§5, ombre solo per elementi
 * sovrapposti).
 */

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/abbonamenti", label: "Abbonamenti" },
  { href: "/persone", label: "Persone" },
  { href: "/servizi", label: "Servizi" },
  { href: "/pagamenti", label: "Pagamenti" },
];

function isActive(href: string, pathname: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  const current =
    LINKS.find((link) => isActive(link.href, pathname))?.label ??
    (pathname.startsWith("/profilo") ? "Profilo" : "Menu");

  // Il menu si chiude toccando fuori o con Esc; con Esc il focus torna al
  // bottone, così chi usa la tastiera non lo perde in fondo alla pagina.
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (!headerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <header ref={headerRef} className="relative z-40 bg-[var(--ink-navy)] text-white">
      <div className="mx-auto flex max-w-7xl items-center gap-x-8 px-4 sm:px-6">
        <Link
          href="/"
          className="py-3 font-[family-name:var(--font-manrope)] text-lg font-bold tracking-tight"
        >
          SubsMate
        </Link>

        <nav aria-label="Navigazione principale" className="hidden flex-1 md:block">
          <ul className="flex gap-x-6 whitespace-nowrap">
            {LINKS.map((link) => {
              const active = isActive(link.href, pathname);
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    className={
                      active
                        ? "inline-block border-b-2 border-white pb-0.5 text-sm font-medium text-white"
                        : "inline-block border-b-2 border-transparent pb-0.5 text-sm text-white/70 transition-colors hover:text-white"
                    }
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <Link
          href="/profilo"
          aria-current={pathname.startsWith("/profilo") ? "page" : undefined}
          className={`hidden py-3 text-xs transition-colors hover:text-white md:block ${
            pathname.startsWith("/profilo") ? "text-white" : "text-white/60"
          }`}
        >
          Profilo
        </Link>

        <button
          type="button"
          onClick={logout}
          className="hidden py-3 text-xs text-white/60 transition-colors hover:text-white md:block"
        >
          Esci
        </button>

        <button
          ref={buttonRef}
          type="button"
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => setOpen((value) => !value)}
          className="ml-auto inline-flex items-center gap-2 rounded-[var(--radius)] border border-white/20 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-white/10 md:hidden"
        >
          <span className="sr-only">Menu, pagina attuale: </span>
          {current}
          {/* Il chevron dice che il bottone apre qualcosa: è un segno funzionale, non una freccia decorativa. */}
          <svg
            aria-hidden
            viewBox="0 0 16 16"
            className={`h-4 w-4 motion-safe:transition-transform ${open ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 6l4 4 4-4" />
          </svg>
        </button>
      </div>

      {open ? (
        <nav
          id={menuId}
          aria-label="Navigazione principale"
          className="absolute inset-x-0 top-full border-t border-white/10 bg-[var(--ink-navy)] shadow-lg md:hidden"
        >
          <ul className="mx-auto max-w-7xl px-1 py-2 sm:px-3">
            {LINKS.map((link) => {
              const active = isActive(link.href, pathname);
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setOpen(false)}
                    className={`block rounded-[var(--radius)] px-3 py-3 text-sm transition-colors ${
                      active
                        ? "bg-white/10 font-medium text-white"
                        : "text-white/70 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="mx-auto max-w-7xl border-t border-white/10 px-1 py-2 sm:px-3">
            <Link
              href="/profilo"
              onClick={() => setOpen(false)}
              className="block rounded-[var(--radius)] px-3 py-3 text-sm text-white/70 transition-colors hover:bg-white/5 hover:text-white"
            >
              Profilo
            </Link>
            <button
              type="button"
              onClick={logout}
              className="block w-full rounded-[var(--radius)] px-3 py-3 text-left text-sm text-white/70 transition-colors hover:bg-white/5 hover:text-white"
            >
              Esci
            </button>
          </div>
        </nav>
      ) : null}
    </header>
  );
}
