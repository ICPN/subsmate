import { requireAdmin } from "@/lib/requireAdmin";
import { listPayments, listSubscriptions } from "@/lib/queries";
import { PageHeader } from "@/components/PageHeader";
import {
  Card,
  TableWrap,
  Th,
  SortableTh,
  Td,
  EmptyState,
  StatCard,
  LinkButton,
} from "@/components/ui";
import { parseSort, sortRows, sortHrefBuilder, type SortValue } from "@/lib/sorting";
import { PAGE_SIZES, parsePagination, paginate, pageHrefBuilder } from "@/lib/pagination";
import Link from "next/link";
import { Pill } from "@/components/StatusBadge";
import { NewPaymentButton, PaymentRowActions } from "@/components/PaymentRowActions";
import { formatEUR, formatDate } from "@/lib/billing";

export const dynamic = "force-dynamic";

/** Persona popolata sul pagamento: serve sia all'ordinamento sia alla riga. */
function personOf(payment: { person: unknown }) {
  return payment.person as { firstName: string; lastName: string; email: string } | null;
}

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; dir?: string; per?: string; page?: string }>;
}) {
  await requireAdmin("/pagamenti");
  const { sort, dir, per, page } = await searchParams;
  const [allPayments, subscriptions] = await Promise.all([
    listPayments(),
    listSubscriptions(),
  ]);

  // Gli abbonamenti cessati non possono ricevere nuovi pagamenti: non si offrono.
  const subscriptionOptions = subscriptions
    .filter((sub) => sub.onboardingStatus !== "cessato")
    .map((sub) => ({
      _id: String(sub._id),
      personName: sub.person
        ? `${sub.person.lastName} ${sub.person.firstName}`
        : "Persona rimossa",
      email: sub.person?.email ?? "",
      serviceName: sub.service?.name ?? "Servizio rimosso",
      serviceLogo: sub.service?.logo ?? null,
      totalDue: sub.computed.totalDue,
      outstanding: sub.computed.outstanding,
      donationSupplement: sub.donationSupplement,
    }))
    .sort((a, b) => a.personName.localeCompare(b.personName, "it"));

  const SORT_ACCESSORS: Record<string, (payment: (typeof allPayments)[number]) => SortValue> = {
    data: (payment) => new Date(payment.paidAt),
    // Per email, come negli altri elenchi: è l'identificativo univoco della persona.
    persona: (payment) => personOf(payment)?.email ?? null,
    importo: (payment) => payment.amount,
    donazione: (payment) => payment.donationAmount ?? 0,
    metodo: (payment) => payment.method ?? null,
    periodo: (payment) => (payment.periodStart ? new Date(payment.periodStart) : null),
    riferimento: (payment) => payment.reference || null,
  };

  const currentSort = parseSort({ sort, dir }, Object.keys(SORT_ACCESSORS), {
    key: "data",
    dir: "desc",
  });
  const sorted = sortRows(allPayments, SORT_ACCESSORS[currentSort.key], currentSort.dir);

  // Si pagina dopo l'ordinamento, così cambiare colonna riordina tutto lo
  // storico e non solo le righe che si stanno guardando.
  const pagination = parsePagination({ per, page }, sorted.length);
  const pageOf = paginate(sorted, pagination);
  const payments = pageOf.rows;

  // Cambiare ordinamento riporta alla prima pagina: `per` si conserva, `page` no.
  const sortHref = sortHrefBuilder(
    "/pagamenti",
    { per: pagination.per === PAGE_SIZES[0] ? undefined : String(pagination.per) },
    currentSort
  );
  const pageHref = pageHrefBuilder(
    "/pagamenti",
    { sort: currentSort.key, dir: currentSort.dir },
    pagination
  );

  // Totali su tutto lo storico, non sulla pagina mostrata: le etichette
  // dicono "registrati" e "totale incassato", e devono valere per l'archivio.
  const collected = allPayments.reduce((sum, payment) => sum + payment.amount, 0);
  const donations = allPayments.reduce((sum, payment) => sum + (payment.donationAmount ?? 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pagamenti"
        description="Storico degli incassi, dal più recente. Ogni riga corrisponde a un ciclo pagato."
        action={<NewPaymentButton subscriptions={subscriptionOptions} />}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Pagamenti registrati" value={String(allPayments.length)} />
        <StatCard label="Totale incassato" value={formatEUR(collected)} />
        <StatCard label="di cui donazioni" value={formatEUR(donations)} />
      </div>

      <Card
        title="Storico"
        action={
          <span className="flex items-center gap-2 text-xs text-[var(--ink-muted)]">
            <span>Righe per pagina</span>
            {PAGE_SIZES.map((size) =>
              size === pagination.per ? (
                <span key={size} className="tnum font-medium text-[var(--ink-navy)]">
                  {size}
                </span>
              ) : (
                <Link
                  key={size}
                  href={pageHref.toSize(size)}
                  className="tnum underline underline-offset-2 hover:text-[var(--ink-navy)]"
                >
                  {size}
                </Link>
              )
            )}
          </span>
        }
      >
        {payments.length === 0 ? (
          <EmptyState title="Nessun pagamento registrato">
            Registra il primo pagamento con il pulsante in alto, oppure dalla scheda di
            un abbonamento.
          </EmptyState>
        ) : (
          <TableWrap>
            <table className="w-full border-collapse">
              <thead className="border-b border-[var(--border)]">
                <tr>
                  <SortableTh sortKey="data" current={currentSort} hrefFor={sortHref}>
                    Data
                  </SortableTh>
                  <SortableTh sortKey="persona" current={currentSort} hrefFor={sortHref}>
                    Persona
                  </SortableTh>
                  <SortableTh
                    sortKey="importo"
                    current={currentSort}
                    hrefFor={sortHref}
                    align="right"
                  >
                    Importo
                  </SortableTh>
                  <SortableTh
                    sortKey="donazione"
                    current={currentSort}
                    hrefFor={sortHref}
                    align="right"
                  >
                    di cui donazione
                  </SortableTh>
                  <SortableTh sortKey="metodo" current={currentSort} hrefFor={sortHref}>
                    Metodo
                  </SortableTh>
                  <SortableTh sortKey="periodo" current={currentSort} hrefFor={sortHref}>
                    Periodo coperto
                  </SortableTh>
                  <SortableTh sortKey="riferimento" current={currentSort} hrefFor={sortHref}>
                    Riferimento
                  </SortableTh>
                  <Th align="right">Azioni</Th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => {
                  const person = personOf(payment);
                  return (
                    <tr
                      key={String(payment._id)}
                      className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface)]"
                    >
                      <Td className="tnum">{formatDate(payment.paidAt)}</Td>
                      <Td>
                        <span className="font-medium">
                          {person ? `${person.firstName} ${person.lastName}` : "—"}
                        </span>
                        <span className="block text-xs text-[var(--ink-muted)]">
                          {person?.email}
                        </span>
                      </Td>
                      <Td align="right" className="tnum font-medium">
                        {formatEUR(payment.amount)}
                      </Td>
                      <Td align="right" className="tnum">
                        {payment.donationAmount ? formatEUR(payment.donationAmount) : "—"}
                      </Td>
                      <Td>
                        <Pill>{payment.method}</Pill>
                      </Td>
                      <Td className="tnum text-[var(--ink-muted)]">
                        {formatDate(payment.periodStart)} – {formatDate(payment.periodEnd)}
                      </Td>
                      <Td className="text-[var(--ink-muted)]">{payment.reference || "—"}</Td>
                      <Td align="right">
                        <PaymentRowActions
                          subscriptionId={String(payment.subscription)}
                          payment={{
                            _id: String(payment._id),
                            amount: payment.amount,
                            donationAmount: payment.donationAmount ?? 0,
                            paidAt: new Date(payment.paidAt).toISOString(),
                            method: payment.method ?? "bonifico",
                            reference: payment.reference ?? "",
                            notes: payment.notes ?? "",
                          }}
                        />
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        )}

        {pageOf.total > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] px-4 py-3 text-xs text-[var(--ink-muted)]">
            <span className="tnum">
              Mostra {pageOf.from}–{pageOf.to} di {pageOf.total} pagamenti
            </span>
            {pageOf.lastPage > 1 ? (
              <span className="flex items-center gap-2">
                {pageOf.hasPrevious ? (
                  <LinkButton href={pageHref.toPage(pagination.page - 1)}>
                    Mostra precedenti
                  </LinkButton>
                ) : null}
                {pageOf.hasNext ? (
                  <LinkButton href={pageHref.toPage(pagination.page + 1)}>
                    Mostra successivi
                  </LinkButton>
                ) : null}
              </span>
            ) : null}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
