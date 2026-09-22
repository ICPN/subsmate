import { getDashboardData } from "@/lib/queries";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import {
  Card,
  StatCard,
  TableWrap,
  Th,
  Td,
  EmptyState,
  LinkButton,
  ServiceMark,
} from "@/components/ui";
import { formatEUR, formatDate, statusDetail } from "@/lib/billing";

// I dati cambiano a ogni pagamento registrato: nessuna cache statica.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { totals, counters, attention } = await getDashboardData();

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        description="Stato degli abbonamenti del team: quanto è dovuto nel ciclo corrente e chi va sollecitato."
        action={
          <LinkButton href="/abbonamenti" variant="primary">
            Vedi abbonamenti
          </LinkButton>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Dovuto nel ciclo corrente"
          value={formatEUR(totals.dueThisCycle)}
          hint={`${totals.activeSubscriptions} abbonamenti attivi`}
        />
        <StatCard
          label="In ritardo"
          value={String(counters.in_ritardo)}
          hint="da sollecitare"
          tone={counters.in_ritardo > 0 ? "critical" : "default"}
        />
        <StatCard
          label="In scadenza"
          value={String(counters.in_scadenza)}
          hint="entro 15 giorni"
          tone={counters.in_scadenza > 0 ? "warn" : "default"}
        />
        <StatCard
          label="Donazioni raccolte"
          value={formatEUR(totals.donationsCollected)}
          hint={`su ${formatEUR(totals.totalCollected)} incassati`}
        />
      </div>

      <Card
        title="Abbonamenti da seguire"
        action={
          <span className="text-xs text-[var(--ink-muted)]">
            Ordinati dalla scadenza più arretrata
          </span>
        }
      >
        {attention.length === 0 ? (
          <EmptyState title="Nessun abbonamento da seguire">
            Tutti gli abbonamenti attivi sono in regola. Gli abbonamenti compaiono qui
            quando mancano meno di 15 giorni alla scadenza.
          </EmptyState>
        ) : (
          <TableWrap>
            <table className="w-full border-collapse">
              <thead className="border-b border-[var(--border)]">
                <tr>
                  <Th>Persona</Th>
                  <Th>Servizio</Th>
                  <Th>Scadenza</Th>
                  <Th align="right">Dovuto</Th>
                  <Th>Stato</Th>
                </tr>
              </thead>
              <tbody>
                {attention.map((sub) => (
                  <tr
                    key={String(sub._id)}
                    className="border-b border-[var(--border)] last:border-0"
                  >
                    <Td>
                      <span className="font-medium">
                        {sub.person ? `${sub.person.firstName} ${sub.person.lastName}` : "—"}
                      </span>
                      <span className="block text-xs text-[var(--ink-muted)]">
                        {sub.person?.email}
                      </span>
                    </Td>
                    <Td>{sub.service ? <ServiceMark name={sub.service.name} /> : "—"}</Td>
                    <Td>
                      <span className="tnum">{formatDate(sub.computed.nextDueDate)}</span>
                      <span className="block text-xs text-[var(--ink-muted)]">
                        {statusDetail(sub.computed.status, sub.computed.daysToDue)}
                      </span>
                    </Td>
                    <Td align="right" className="tnum font-medium">
                      {formatEUR(sub.computed.totalDue)}
                    </Td>
                    <Td>
                      <StatusBadge status={sub.computed.status} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
