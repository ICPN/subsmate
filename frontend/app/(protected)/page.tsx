import { requireAdmin } from "@/lib/requireAdmin";
import { getDashboardData } from "@/lib/queries";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import {
  Card,
  StatCard,
  TableWrap,
  SortableTh,
  Td,
  EmptyState,
  LinkButton,
  ServiceMark,
} from "@/components/ui";
import { MigrationBadge } from "@/components/MigrationBadge";
import { parseSort, sortRows, sortHrefBuilder, type SortValue } from "@/lib/sorting";
import type { SubscriptionView } from "@/lib/queries";
import { formatEUR, formatDate, statusDetail } from "@/lib/billing";

// I dati cambiano a ogni pagamento registrato: nessuna cache statica.
export const dynamic = "force-dynamic";

/**
 * L'ordine predefinito resta la scadenza più arretrata: è la domanda che la
 * dashboard risponde. Le colonne restano comunque ordinabili come negli altri
 * elenchi.
 */
const SORT_ACCESSORS: Record<string, (sub: SubscriptionView) => SortValue> = {
  // Per email, come negli altri elenchi: è l'identificativo univoco della persona.
  persona: (sub) => sub.person?.email ?? null,
  servizio: (sub) => sub.service?.name ?? null,
  scadenza: (sub) => sub.computed.nextDueDate,
  dovuto: (sub) => sub.computed.totalDue,
  stato: (sub) => sub.computed.daysToDue,
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; dir?: string }>;
}) {
  await requireAdmin("/");
  const { sort, dir } = await searchParams;
  const { totals, counters, attention } = await getDashboardData();

  const currentSort = parseSort({ sort, dir }, Object.keys(SORT_ACCESSORS), {
    key: "scadenza",
    dir: "asc",
  });
  const attentionRows = sortRows(attention, SORT_ACCESSORS[currentSort.key], currentSort.dir);
  const sortHref = sortHrefBuilder("/", {}, currentSort);

  return (
    <div className="space-y-6">
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
                  <SortableTh sortKey="persona" current={currentSort} hrefFor={sortHref}>
                    Persona
                  </SortableTh>
                  <SortableTh sortKey="servizio" current={currentSort} hrefFor={sortHref}>
                    Servizio
                  </SortableTh>
                  <SortableTh sortKey="scadenza" current={currentSort} hrefFor={sortHref}>
                    Scadenza
                  </SortableTh>
                  <SortableTh
                    sortKey="dovuto"
                    current={currentSort}
                    hrefFor={sortHref}
                    align="right"
                  >
                    Dovuto
                  </SortableTh>
                  <SortableTh sortKey="stato" current={currentSort} hrefFor={sortHref}>
                    Stato
                  </SortableTh>
                </tr>
              </thead>
              <tbody>
                {attentionRows.map((sub) => (
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
                    <Td>
                      {sub.service ? (
                        <ServiceMark name={sub.service.name} logo={sub.service.logo} />
                      ) : (
                        "—"
                      )}
                      <MigrationBadge alert={sub.migration?.alert ?? null} />
                    </Td>
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
