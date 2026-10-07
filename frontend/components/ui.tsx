import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import type { SortState } from "@/lib/sorting";

/**
 * Primitive condivise: card, statistiche, bottoni, tabella, stato vuoto.
 * Bordi sottili al posto delle ombre; le ombre restano riservate agli elementi
 * sovrapposti (§5).
 */

/**
 * Emoji di orientamento (brand-guidelines §6): una sola, all'inizio, mai
 * decorativa. `aria-hidden` perché il testo accanto deve bastare da solo: un
 * lettore di schermo direbbe «segno di spunta verde» prima di ogni conferma.
 */
export function Emoji({ children, className = "" }: { children: string; className?: string }) {
  return (
    <span aria-hidden className={`mr-1.5 inline-block not-italic ${className}`}>
      {children}
    </span>
  );
}

export function Card({
  title,
  action,
  children,
  className = "",
}: {
  title?: ReactNode;
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
  emoji,
  value,
  hint,
  tone = "default",
  href,
}: {
  label: string;
  /** Solo per i contatori di stato: rafforza il significato, non decora. */
  emoji?: string;
  value: string;
  hint?: string;
  tone?: "default" | "ok" | "warn" | "critical" | "neutral";
  /** Pagina di gestione che risponde al numero. Senza, il riquadro non è cliccabile. */
  href?: string;
}) {
  const TONES = {
    default: "var(--ink-navy)",
    ok: "var(--status-ok)",
    warn: "var(--status-warn)",
    critical: "var(--status-critical)",
    neutral: "var(--status-neutral)",
  } as const;

  const base =
    "block rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3 py-4 text-center sm:px-4 sm:py-5";
  // Il feedback del click è bordo e sfondo, mai uno dei quattro colori di
  // stato: quelli restano riservati allo stato di un abbonamento.
  const interattivo =
    " transition-colors hover:border-[var(--ink-navy)] hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink-navy)]";

  const contenuto = (
    <>
      <p
        className="tnum font-[family-name:var(--font-manrope)] text-[24px] font-bold leading-none sm:text-[32px]"
        style={{ color: TONES[tone] }}
      >
        {value}
      </p>
      <p className="mt-1.5 text-sm font-medium">
        {emoji ? <Emoji>{emoji}</Emoji> : null}
        {label}
      </p>
      {hint ? <p className="mt-1 text-xs text-[var(--ink-muted)]">{hint}</p> : null}
    </>
  );

  if (!href) return <div className={base}>{contenuto}</div>;
  return (
    <Link href={href} className={base + interattivo}>
      {contenuto}
    </Link>
  );
}

const BUTTON_BASE =
  "inline-flex items-center justify-center whitespace-nowrap rounded-[var(--radius)] px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";

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
 * poter scorrere lateralmente. Sotto i 1024px la tabella diventa un elenco di
 * schede (classe `table-stack`, globals.css) e non scorre più.
 */
export function TableWrap({ children }: { children: ReactNode }) {
  return (
    <div className="table-stack w-full max-w-full overflow-x-auto overscroll-x-contain">{children}</div>
  );
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
      className={`whitespace-nowrap px-4 py-2.5 text-xs font-medium text-[var(--ink-muted)] ${
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
 * Nelle colonne a destra la freccia sta prima dell'etichetta: anche quando è
 * invisibile occupa spazio, e in coda staccherebbe il titolo dai numeri.
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
      className={`whitespace-nowrap px-4 py-2.5 text-xs font-medium text-[var(--ink-muted)] ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      <Link
        href={hrefFor(sortKey)}
        className={`inline-flex items-center gap-1 rounded-[var(--radius)] underline-offset-2 hover:underline ${
          align === "right" ? "flex-row-reverse" : ""
        } ${active ? "text-[var(--ink-navy)]" : ""}`}
      >
        {children}
        <span aria-hidden className={active ? "" : "opacity-0"}>
          {ascending ? "↑" : "↓"}
        </span>
      </Link>
    </th>
  );
}

/**
 * `label` è il nome della colonna ripetuto nella scheda mobile. Senza, la cella
 * fa da titolo della scheda (o da riga azioni, se è l'ultima). Il contenuto sta
 * in un div perché nella scheda la cella è una riga flex: testo e righe
 * secondarie devono restare un blocco solo accanto all'etichetta.
 */
export function Td({
  children,
  align = "left",
  className = "",
  label,
}: {
  children: ReactNode;
  align?: "left" | "right";
  className?: string;
  label?: string;
}) {
  return (
    <td
      data-label={label}
      className={`px-4 py-2 align-middle ${align === "right" ? "text-right" : "text-left"} ${className}`}
    >
      <div className="min-w-0">{children}</div>
    </td>
  );
}

export function EmptyState({
  title,
  emoji,
  children,
}: {
  title: string;
  /** Dice di che vuoto si tratta: 🧾 pagamenti, 👥 persone, 🔍 ricerca senza risultati. */
  emoji?: string;
  children?: ReactNode;
}) {
  return (
    <div className="px-4 py-8 text-center">
      {emoji ? (
        <p aria-hidden className="mb-2 text-[32px] leading-none">
          {emoji}
        </p>
      ) : null}
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
    <span className="flex w-fit items-center gap-2">
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
