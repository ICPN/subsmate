import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/requireAdmin";
import { getSubscriptionDetail, listServices } from "@/lib/queries";
import { PlanMigrationButton } from "@/components/MigrationForm";
import { MigrationBanner } from "@/components/MigrationBanner";
import { SubscriptionRowActions } from "@/components/SubscriptionActions";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge, Pill } from "@/components/StatusBadge";
import { Card, TableWrap, Th, SortableTh, Td, EmptyState, ServiceMark } from "@/components/ui";
import { parseSort, sortRows, sortHrefBuilder, type SortValue } from "@/lib/sorting";
import { RegisterPaymentForm } from "@/components/RegisterPaymentForm";
import { PaymentRowActions } from "@/components/PaymentRowActions";
import { formatEUR, formatDate, statusDetail, toDateInputValue } from "@/lib/billing";

export const dynamic = "force-dynamic";

const PERIODICITY_LABELS: Record<string, string> = {
  monthly: "Mensile",
  quarterly: "Trimestrale",
};

const ONBOARDING_LABELS: Record<string, string> = {
  da_attivare: "Da attivare",
  attivo: "Attivo",
  sospeso: "Sospeso",
  cessato: "Cessato",
};

export default async function SubscriptionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sort?: string; dir?: string }>;
}) {
  const { id } = await params;
  const { sort, dir } = await searchParams;
  await requireAdmin(`/abbonamenti/${id}`);
  const detail = await getSubscriptionDetail(id);
  if (!detail) notFound();

  // Destinazioni possibili: i servizi attivi diversi da quello in corso.
  // Un servizio disattivato non è una meta valida, e migrare su sé stessi
  // non ha senso: la rotta lo rifiuta comunque, ma è meglio non offrirlo.
  const services = await listServices();

  const { subscription: sub, payments: allPayments } = detail;

  const SORT_ACCESSORS: Record<string, (payment: (typeof allPayments)[number]) => SortValue> = {
    data: (payment) => new Date(payment.paidAt),
    importo: (payment) => payment.amount,
    donazione: (payment) => payment.donationAmount ?? 0,
    metodo: (payment) => payment.method ?? null,
    periodo: (payment) => (payment.periodStart ? new Date(payment.periodStart) : null),
  };

  const currentSort = parseSort({ sort, dir }, Object.keys(SORT_ACCESSORS), {
    key: "data",
    dir: "desc",
  });
  const payments = sortRows(allPayments, SORT_ACCESSORS[currentSort.key], currentSort.dir);
  const sortHref = sortHrefBuilder(`/abbonamenti/${id}`, {}, currentSort);
  const personName = sub.person ? `${sub.person.firstName} ${sub.person.lastName}` : "Persona rimossa";

  const migrationTargets = services
    .filter((service) => service.active && String(service._id) !== String(sub.service?._id))
    .map((service) => ({
      _id: String(service._id),
      name: service.name,
      monthlyRate: service.monthlyRate,
    }));
  const hasPendingMigration = sub.migration?.status === "pianificata";

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/abbonamenti"
          className="text-xs font-medium text-[var(--ink-muted)] underline-offset-2 hover:underline"
        >
          Torna agli abbonamenti
        </Link>
      </div>

      <PageHeader
        title={personName}
        description={sub.person?.email}
        action={
          <div className="flex items-center gap-3">
            <StatusBadge status={sub.computed.status} />
            <SubscriptionRowActions
              subscription={{
                _id: String(sub._id),
                person: sub.person ? String(sub.person._id) : "",
                personLabel: personName,
                service: sub.service ? String(sub.service._id) : "",
                serviceLabel: sub.service?.name ?? "Servizio rimosso",
                periodicity: sub.periodicity,
                donationSupplement: sub.donationSupplement,
                onboardingStatus: sub.onboardingStatus,
                startDate: toDateInputValue(sub.startDate),
                notes: sub.notes ?? "",
              }}
              redirectOnDeleteTo="/abbonamenti"
            />
            {/* Una migrazione già pianificata si gestisce dal banner, non se
                ne pianifica una seconda: l'indice unico parziale la rifiuta. */}
            {hasPendingMigration || sub.onboardingStatus === "cessato" ? null : (
              <PlanMigrationButton
                subscriptionId={String(sub._id)}
                services={migrationTargets}
                periodicity={sub.periodicity}
                donationSupplement={sub.donationSupplement}
                oldMonthlyRate={sub.service?.monthlyRate ?? 0}
                oldNextDueDate={sub.computed.nextDueDate?.toISOString() ?? null}
                oldPaidForCurrentCycle={sub.computed.paidForCurrentCycle}
              />
            )}
          </div>
        }
      />

      {sub.migration ? <MigrationBanner migration={sub.migration} /> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DetailTile label="Servizio">
          {sub.service ? <ServiceMark name={sub.service.name} logo={sub.service.logo} /> : "—"}
        </DetailTile>
        <DetailTile label="Periodicità">
          <Pill>{PERIODICITY_LABELS[sub.periodicity] ?? sub.periodicity}</Pill>
        </DetailTile>
        <DetailTile label="Totale dovuto per ciclo">
          <span className="tnum font-[family-name:var(--font-manrope)] text-[20px] font-bold">
            {formatEUR(sub.computed.totalDue)}
          </span>
          <span className="block text-xs text-[var(--ink-muted)]">
            {formatEUR(sub.computed.serviceQuota)} quota
            {sub.computed.donationSupplement > 0
              ? ` + ${formatEUR(sub.computed.donationSupplement)} donazione`
              : ""}
          </span>
          {sub.computed.outstanding > 0 ? (
            <span
              className="tnum mt-1 block text-xs font-medium"
              style={{ color: "var(--status-warn)" }}
            >
              Incassati {formatEUR(sub.computed.paidForCurrentCycle)}: mancano{" "}
              {formatEUR(sub.computed.outstanding)}
            </span>
          ) : null}
        </DetailTile>
        <DetailTile label="Prossima scadenza">
          <span className="tnum">{formatDate(sub.computed.nextDueDate)}</span>
          <span className="block text-xs text-[var(--ink-muted)]">
            {statusDetail(sub.computed.status, sub.computed.daysToDue)}
          </span>
        </DetailTile>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card title="Registra pagamento">
          <RegisterPaymentForm
            subscriptionId={String(sub._id)}
            defaultAmount={sub.computed.totalDue}
            defaultDonation={sub.computed.donationSupplement}
            defaultOutstanding={sub.computed.outstanding}
          />
        </Card>

        <Card
          title="Storico pagamenti"
          action={
            <span className="text-xs text-[var(--ink-muted)]">
              {payments.length} {payments.length === 1 ? "pagamento" : "pagamenti"}
            </span>
          }
        >
          {payments.length === 0 ? (
            <EmptyState title="Nessun pagamento registrato">
              {sub.onboardingStatus === "da_attivare"
                ? (
                  <>
                    Registra il primo pagamento: l&apos;abbonamento passerà da
                    &laquo;{ONBOARDING_LABELS[sub.onboardingStatus]}&raquo; ad &laquo;Attivo&raquo;.
                  </>
                )
                : "Nessun pagamento ancora registrato per questo abbonamento."}
            </EmptyState>
          ) : (
            <TableWrap>
              <table className="w-full border-collapse">
                <thead className="border-b border-[var(--border)]">
                  <tr>
                    <SortableTh sortKey="data" current={currentSort} hrefFor={sortHref}>
                      Data
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
                      Donazione
                    </SortableTh>
                    <SortableTh sortKey="metodo" current={currentSort} hrefFor={sortHref}>
                      Metodo
                    </SortableTh>
                    <SortableTh sortKey="periodo" current={currentSort} hrefFor={sortHref}>
                      Periodo coperto
                    </SortableTh>
                    <Th align="right">Azioni</Th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => (
                    <tr
                      key={String(payment._id)}
                      className="border-b border-[var(--border)] last:border-0"
                    >
                      <Td className="tnum">{formatDate(payment.paidAt)}</Td>
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
                      <Td align="right">
                        <PaymentRowActions
                          subscriptionId={String(sub._id)}
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
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>
      </div>

      {sub.notes ? (
        <Card title="Note">
          <p className="px-4 py-3 text-sm text-[var(--ink-muted)]">{sub.notes}</p>
        </Card>
      ) : null}
    </div>
  );
}

function DetailTile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
      <p className="mb-1 text-xs font-medium text-[var(--ink-muted)]">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  );
}
