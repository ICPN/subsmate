import { requireAdmin } from "@/lib/requireAdmin";
import { listPayments } from "@/lib/queries";
import { PageHeader } from "@/components/PageHeader";
import { Card, TableWrap, Th, Td, EmptyState, StatCard } from "@/components/ui";
import { Pill } from "@/components/StatusBadge";
import { formatEUR, formatDate } from "@/lib/billing";

export const dynamic = "force-dynamic";

export default async function PaymentsPage() {
  await requireAdmin("/pagamenti");
  const payments = await listPayments(100);

  const collected = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const donations = payments.reduce((sum, payment) => sum + (payment.donationAmount ?? 0), 0);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Pagamenti"
        description="Storico degli incassi, dal più recente. Ogni riga corrisponde a un ciclo pagato."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Pagamenti registrati" value={String(payments.length)} />
        <StatCard label="Totale incassato" value={formatEUR(collected)} />
        <StatCard label="di cui donazioni" value={formatEUR(donations)} />
      </div>

      <Card
        title="Storico"
        action={
          <span className="text-xs text-[var(--ink-muted)]">Ultimi 100 movimenti</span>
        }
      >
        {payments.length === 0 ? (
          <EmptyState title="Nessun pagamento registrato">
            I pagamenti si registrano dalla scheda di un abbonamento, oppure arrivano
            dall&apos;import del Google Sheet.
          </EmptyState>
        ) : (
          <TableWrap>
            <table className="w-full border-collapse">
              <thead className="border-b border-[var(--border)]">
                <tr>
                  <Th>Data</Th>
                  <Th>Persona</Th>
                  <Th align="right">Importo</Th>
                  <Th align="right">di cui donazione</Th>
                  <Th>Metodo</Th>
                  <Th>Periodo coperto</Th>
                  <Th>Riferimento</Th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => {
                  const person = payment.person as unknown as
                    | { firstName: string; lastName: string; email: string }
                    | null;
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
