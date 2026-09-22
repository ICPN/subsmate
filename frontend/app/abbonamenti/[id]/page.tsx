import Link from "next/link";
import { notFound } from "next/navigation";
import { getSubscriptionDetail } from "@/lib/queries";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge, Pill } from "@/components/StatusBadge";
import { Card, TableWrap, Th, Td, EmptyState, ServiceMark } from "@/components/ui";
import { RegisterPaymentForm } from "@/components/RegisterPaymentForm";
import { formatEUR, formatDate, statusDetail } from "@/lib/billing";

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
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getSubscriptionDetail(id);
  if (!detail) notFound();

  const { subscription: sub, payments } = detail;
  const personName = sub.person ? `${sub.person.firstName} ${sub.person.lastName}` : "Persona rimossa";

  return (
    <div className="space-y-8">
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
        action={<StatusBadge status={sub.computed.status} />}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DetailTile label="Servizio">
          {sub.service ? <ServiceMark name={sub.service.name} /> : "—"}
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
        </DetailTile>
        <DetailTile label="Prossima scadenza">
          <span className="tnum">{formatDate(sub.computed.nextDueDate)}</span>
          <span className="block text-xs text-[var(--ink-muted)]">
            {statusDetail(sub.computed.status, sub.computed.daysToDue)}
          </span>
        </DetailTile>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card title="Registra pagamento">
          <RegisterPaymentForm
            subscriptionId={String(sub._id)}
            defaultAmount={sub.computed.totalDue}
            defaultDonation={sub.computed.donationSupplement}
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
              Registra il primo pagamento: l&apos;abbonamento passerà da
              &laquo;{ONBOARDING_LABELS[sub.onboardingStatus]}&raquo; ad &laquo;Attivo&raquo;.
            </EmptyState>
          ) : (
            <TableWrap>
              <table className="w-full border-collapse">
                <thead className="border-b border-[var(--border)]">
                  <tr>
                    <Th>Data</Th>
                    <Th align="right">Importo</Th>
                    <Th align="right">Donazione</Th>
                    <Th>Metodo</Th>
                    <Th>Periodo coperto</Th>
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
          <p className="px-5 py-4 text-sm text-[var(--ink-muted)]">{sub.notes}</p>
        </Card>
      ) : null}
    </div>
  );
}

function DetailTile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-5 py-4">
      <p className="mb-1 text-xs font-medium text-[var(--ink-muted)]">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  );
}
