"use client";

import { useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import { inputClass } from "@/components/form";
import { StatusBadge, Pill } from "@/components/StatusBadge";
import { Card, TableWrap, Th, SortableTh, Td, EmptyState, ServiceMark } from "@/components/ui";
import { MigrationBadge } from "@/components/MigrationBadge";
import { SubscriptionRowActions } from "@/components/SubscriptionActions";
import { sortHrefBuilder, type SortState } from "@/lib/sorting";
import { matchesQuery } from "@/lib/search";
import { formatEUR, formatDate, toDateInputValue } from "@/lib/billing";
import type { SubscriptionView } from "@/lib/queries";

/**
 * Elenco degli abbonamenti con la ricerca che filtra mentre si scrive.
 *
 * È un componente client solo per questo: la pagina resta un Server Component
 * che legge, calcola e ordina: qui arrivano righe già pronte. Il filtro è nel
 * browser perché la pagina carica comunque tutti gli abbonamenti — stato,
 * quota e scadenza non esistono nel database e vanno calcolati riga per riga —
 * quindi restringerli non costa nulla, mentre una query per ogni tasto premuto
 * costerebbe un giro di rete e un ricalcolo completo.
 *
 * Il testo cercato finisce comunque nell'URL, come già i filtri per stato e
 * servizio: il link resta condivisibile e sopravvive a un refresh. Ci finisce
 * con `replaceState` e non con una navigazione, altrimenti ogni tasto premuto
 * sarebbe una riga nella cronologia del browser e una lettura del database.
 *
 * Durante il render sul server questo stesso filtro viene applicato al valore
 * iniziale, quindi l'HTML servito per un link con `?q=` è già quello giusto e
 * l'idratazione non cambia nulla sotto gli occhi di chi legge.
 */

const PERIODICITY_LABELS: Record<string, string> = {
  monthly: "Mensile",
  quarterly: "Trimestrale",
};

/** I campi su cui si cerca: chi cerca ricorda un nome, una mail o un servizio. */
function searchFields(sub: SubscriptionView): (string | null | undefined)[] {
  return [
    sub.person?.firstName,
    sub.person?.lastName,
    sub.person?.email,
    sub.service?.name,
  ];
}

export function SubscriptionsTable({
  rows,
  totalCount,
  initialQuery,
  currentSort,
  sortParams,
  hasFilters,
}: {
  /** Righe già filtrate per stato e servizio e già ordinate dal server. */
  rows: SubscriptionView[];
  /** Quanti abbonamenti esistono in tutto, prima di qualunque filtro. */
  totalCount: number;
  initialQuery: string;
  currentSort: SortState;
  /** Parametri da conservare nei link di ordinamento (stato, servizio, testo). */
  sortParams: Record<string, string | undefined>;
  /** Vero se stato o servizio stanno già restringendo l'elenco. */
  hasFilters: boolean;
}) {
  const [query, setQuery] = useState(initialQuery);
  const searchId = useId();

  const visible = useMemo(
    () => rows.filter((sub) => matchesQuery(searchFields(sub), query)),
    [rows, query]
  );

  // L'ordinamento resta un link: funziona anche senza JavaScript e conserva
  // il testo cercato, che al momento del render sul server è ancora quello
  // dell'URL.
  const sortHref = sortHrefBuilder("/abbonamenti", { ...sortParams, q: query || undefined }, currentSort);

  useEffect(() => {
    const url = new URL(window.location.href);
    const trimmed = query.trim();
    if (trimmed) url.searchParams.set("q", trimmed);
    else url.searchParams.delete("q");
    if (url.toString() === window.location.href) return;
    // replaceState e non push: scrivere non è navigare, e non deve riempire
    // il tasto "indietro" di una voce per lettera.
    window.history.replaceState(null, "", url.toString());
  }, [query]);

  return (
    <Card
      action={
        <span className="text-xs text-[var(--ink-muted)]">
          {visible.length} di {totalCount} abbonamenti
        </span>
      }
      title="Elenco"
    >
      <div className="border-b border-[var(--border)] px-4 py-3">
        <label htmlFor={searchId} className="sr-only">
          Cerca fra gli abbonamenti
        </label>
        <input
          id={searchId}
          type="search"
          autoComplete="off"
          className={inputClass}
          placeholder="Cerca per nome, email o servizio"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {visible.length === 0 ? (
        <EmptyState title="Nessun abbonamento da mostrare">
          {query.trim() ? (
            <>Nessun abbonamento corrisponde a «{query.trim()}».</>
          ) : totalCount === 0 ? (
            <>
              Importa i dati esistenti dal Google Sheet con{" "}
              <code className="font-mono text-xs">execution/import_subs_from_sheet.py</code>,
              oppure creane uno con{" "}
              <code className="font-mono text-xs">POST /api/subscriptions</code>.
            </>
          ) : hasFilters ? (
            "Nessun abbonamento corrisponde ai filtri selezionati."
          ) : null}
        </EmptyState>
      ) : (
        <TableWrap>
          <table className="w-full border-collapse">
            <thead className="border-b border-[var(--border)]">
              <tr>
                <SortableTh sortKey="persona" current={currentSort} hrefFor={sortHref}>
                  Persona
                </SortableTh>
                <SortableTh sortKey="servizio" current={currentSort} hrefFor={sortHref}>
                  Servizio
                </SortableTh>
                <SortableTh sortKey="periodicita" current={currentSort} hrefFor={sortHref}>
                  Periodicità
                </SortableTh>
                <SortableTh sortKey="quota" current={currentSort} hrefFor={sortHref} align="right">
                  Quota
                </SortableTh>
                <SortableTh
                  sortKey="donazione"
                  current={currentSort}
                  hrefFor={sortHref}
                  align="right"
                >
                  Donazione
                </SortableTh>
                <SortableTh sortKey="totale" current={currentSort} hrefFor={sortHref} align="right">
                  Totale
                </SortableTh>
                <SortableTh sortKey="scadenza" current={currentSort} hrefFor={sortHref}>
                  Scadenza
                </SortableTh>
                <SortableTh sortKey="stato" current={currentSort} hrefFor={sortHref}>
                  Stato
                </SortableTh>
                <Th align="right">Azioni</Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((sub) => (
                <tr
                  key={String(sub._id)}
                  className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface)]"
                >
                  <Td>
                    <Link
                      href={`/abbonamenti/${sub._id}`}
                      className="font-medium underline-offset-2 hover:underline"
                    >
                      {sub.person ? `${sub.person.firstName} ${sub.person.lastName}` : "—"}
                    </Link>
                    <span className="block text-xs text-[var(--ink-muted)]">
                      {sub.person?.email}
                    </span>
                  </Td>
                  <Td>
                    {sub.service ? (
                      <ServiceMark name={sub.service.name} logo={sub.service.logo} />
                    ) : (
                      "—"
                    )}
                    <MigrationBadge alert={sub.migration?.alert ?? null} />
                  </Td>
                  <Td>
                    <Pill>{PERIODICITY_LABELS[sub.periodicity] ?? sub.periodicity}</Pill>
                  </Td>
                  <Td align="right" className="tnum">
                    {formatEUR(sub.computed.serviceQuota)}
                  </Td>
                  <Td align="right" className="tnum">
                    {sub.computed.donationSupplement > 0
                      ? formatEUR(sub.computed.donationSupplement)
                      : "—"}
                  </Td>
                  <Td align="right" className="tnum font-medium">
                    {formatEUR(sub.computed.totalDue)}
                    {sub.computed.outstanding > 0 ? (
                      <span
                        className="block text-xs font-medium"
                        style={{ color: "var(--status-warn)" }}
                      >
                        mancano {formatEUR(sub.computed.outstanding)}
                      </span>
                    ) : null}
                  </Td>
                  <Td className="tnum whitespace-nowrap">{formatDate(sub.computed.nextDueDate)}</Td>
                  <Td>
                    <StatusBadge status={sub.computed.status} />
                  </Td>
                  <Td align="right">
                    <SubscriptionRowActions
                      subscription={{
                        _id: String(sub._id),
                        person: sub.person ? String(sub.person._id) : "",
                        personLabel: sub.person
                          ? `${sub.person.firstName} ${sub.person.lastName} — ${sub.person.email}`
                          : "Persona rimossa",
                        service: sub.service ? String(sub.service._id) : "",
                        serviceLabel: sub.service?.name ?? "Servizio rimosso",
                        periodicity: sub.periodicity,
                        donationSupplement: sub.donationSupplement,
                        onboardingStatus: sub.onboardingStatus,
                        startDate: toDateInputValue(sub.startDate),
                        notes: sub.notes ?? "",
                      }}
                    />
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </Card>
  );
}
