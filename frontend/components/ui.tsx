import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import type { SortState } from "@/lib/sorting";

/**
 * Primitive condivise: card, statistiche, bottoni, tabella, stato vuoto.
 * Bordi sottili al posto delle ombre; le ombre restano riservate agli elementi
 * sovrapposti (§5).
 */

export function Card({
  title,
  action,
  children,
  className = "",
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-[var(--radius)] border border-[var(--border)] bg-[var(--paper)] ${className}`}
    >
      {title || action ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
          {title ? (
            <h2 className="font-[family-name:var(--font-manrope)] text-[18px] font-semibold">
              {title}
            </h2>
          ) : (
            <span />
          )}
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/**
 * Card statistica: sfondo Surface, numero grande in Manrope, etichetta sotto.
 * È l'unico punto dove il contenuto può essere centrato (§5).
 */
export function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "ok" | "warn" | "critical" | "neutral";
}) {
  const TONES = {
    default: "var(--ink-navy)",
    ok: "var(--status-ok)",
    warn: "var(--status-warn)",
    critical: "var(--status-critical)",
    neutral: "var(--status-neutral)",
  } as const;

  return (
    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-5 text-center">
      <p
        className="tnum font-[family-name:var(--font-manrope)] text-[32px] font-bold leading-none"
        style={{ color: TONES[tone] }}
      >
        {value}
      </p>
      <p className="mt-1.5 text-sm font-medium">{label}</p>
      {hint ? <p className="mt-1 text-xs text-[var(--ink-muted)]">{hint}</p> : null}
    </div>
  );
}

const BUTTON_BASE =
  "inline-flex items-center justify-center rounded-[var(--radius)] px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";

export const buttonPrimary = `${BUTTON_BASE} bg-[var(--ink-navy)] text-white hover:bg-[#232a42]`;
export const buttonSecondary = `${BUTTON_BASE} border border-[var(--border)] bg-transparent text-[var(--ink-navy)] hover:bg-[var(--surface)]`;

export function LinkButton({
  href,
  children,
  variant = "secondary",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
}) {
  return (
    <Link href={href} className={variant === "primary" ? buttonPrimary : buttonSecondary}>
      {children}
    </Link>
  );
}

/**
 * Involucro tabella: è l'unico elemento che scorre in orizzontale. Serve anche a
 * isolare la larghezza minima della tabella dal resto della pagina, che non deve mai
 * poter scorrere lateralmente.
 */
export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="w-full max-w-full overflow-x-auto overscroll-x-contain">{children}</div>;
}

export function Th({
  children,
  align = "left",
}: {
  children: ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      scope="col"
      className={`px-4 py-2.5 text-xs font-medium text-[var(--ink-muted)] ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

/**
 * Intestazione ordinabile: un link, non un bottone, così l'ordinamento resta
 * nell'URL ed è condivisibile, e funziona anche senza JavaScript.
 * L'indicatore di direzione è informativo, non decorativo: le guidelines
 * vietano le frecce ornamentali sui link, non i segni che portano un dato.
 */
export function SortableTh({
  children,
  sortKey,
  current,
  hrefFor,
  align = "left",
}: {
  children: ReactNode;
  sortKey: string;
  current: SortState;
  hrefFor: (key: string) => string;
  align?: "left" | "right";
}) {
  const active = current.key === sortKey;
  const ascending = current.dir === "asc";

  return (
    <th
      scope="col"
      aria-sort={active ? (ascending ? "ascending" : "descending") : "none"}
      className={`px-4 py-2.5 text-xs font-medium text-[var(--ink-muted)] ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      <Link
        href={hrefFor(sortKey)}
        className={`inline-flex items-center gap-1 rounded-[var(--radius)] underline-offset-2 hover:underline ${
          active ? "text-[var(--ink-navy)]" : ""
        }`}
      >
        {children}
        <span aria-hidden className={active ? "" : "opacity-0"}>
          {ascending ? "↑" : "↓"}
        </span>
      </Link>
    </th>
  );
}

export function Td({
  children,
  align = "left",
  className = "",
}: {
  children: ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <td
      className={`px-4 py-2 align-middle ${align === "right" ? "text-right" : "text-left"} ${className}`}
    >
      {children}
    </td>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="px-4 py-8 text-center">
      <p className="font-[family-name:var(--font-manrope)] text-[18px] font-semibold">{title}</p>
      {children ? (
        <div className="mx-auto mt-2 max-w-md text-sm break-words text-[var(--ink-muted)]">{children}</div>
      ) : null}
    </div>
  );
}

/**
 * Segno del servizio: logo in un cerchio Surface, o l'iniziale se il servizio
 * non ha un'immagine. Identifica il servizio, non decora (§6), quindi l'immagine
 * è `aria-hidden`: il nome accanto è già l'etichetta leggibile.
 */
export function ServiceMark({ name, logo }: { name: string; logo?: string | null }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden
        className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--surface)] font-[family-name:var(--font-manrope)] text-xs font-semibold text-[var(--ink-muted)]"
      >
        {logo ? (
          <Image src={logo} alt="" width={24} height={24} className="h-full w-full object-contain" />
        ) : (
          name.slice(0, 1).toUpperCase()
        )}
      </span>
      <span>{name}</span>
    </span>
  );
}
