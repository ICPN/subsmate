import Link from "next/link";
import type { ReactNode } from "react";

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
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
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
    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-5 py-6 text-center">
      <p
        className="tnum font-[family-name:var(--font-manrope)] text-[32px] font-bold leading-none"
        style={{ color: TONES[tone] }}
      >
        {value}
      </p>
      <p className="mt-2 text-sm font-medium">{label}</p>
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

/** Involucro tabella: scroll orizzontale sotto i 900px senza rompere il layout. */
export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto">{children}</div>;
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
      className={`px-5 py-3 text-xs font-medium text-[var(--ink-muted)] ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
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
      className={`px-5 py-3 align-middle ${align === "right" ? "text-right" : "text-left"} ${className}`}
    >
      {children}
    </td>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="px-5 py-10 text-center">
      <p className="font-[family-name:var(--font-manrope)] text-[18px] font-semibold">{title}</p>
      {children ? (
        <div className="mx-auto mt-2 max-w-md text-sm text-[var(--ink-muted)]">{children}</div>
      ) : null}
    </div>
  );
}

/**
 * Segno del servizio: cerchio Surface con l'iniziale, coerente con le icone
 * lineari in cerchi del riferimento. Identifica il servizio, non decora (§6).
 */
export function ServiceMark({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden
        className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--surface)] font-[family-name:var(--font-manrope)] text-xs font-semibold text-[var(--ink-muted)]"
      >
        {name.slice(0, 1).toUpperCase()}
      </span>
      <span>{name}</span>
    </span>
  );
}
