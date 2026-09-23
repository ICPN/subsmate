import Link from "next/link";
import { requireAdmin } from "@/lib/requireAdmin";
import { getDashboardData } from "@/lib/queries";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge, Pill } from "@/components/StatusBadge";
import {
  Card,
  StatCard,
  TableWrap,
  SortableTh,
  Th,
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
  const { totals, counters, attention, byService, recentPayments, plannedMigrations, registry } =
    await getDashboardData();

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
        description="Stato degli abbonamenti del team: quanto è dovuto nel ciclo corrente e chi va sollecitato. Ogni riquadro porta alla pagina che lo gestisce."
        action={
          <LinkButton href="/abbonamenti" variant="primary">
            Vedi abbonamenti
          </LinkButton>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Dovuto nel ciclo corrente"
          value={formatEUR(totals.dueThisCycle)}
          hint={`${totals.activeSubscriptions} abbonamenti attivi`}
          href="/abbonamenti"
        />
        <StatCard
          label="Da incassare"
          value={formatEUR(totals.outstanding)}
          hint="al netto dei versamenti parziali"
          tone={totals.outstanding > 0 ? "warn" : "default"}
          href="/abbonamenti"
        />
        <StatCard
          label="In ritardo"
          value={String(counters.in_ritardo)}
          hint="da sollecitare"
          tone={counters.in_ritardo > 0 ? "critical" : "default"}
          href="/abbonamenti?status=in_ritardo"
        />
        <StatCard
          label="In scadenza"
          value={String(counters.in_scadenza)}
          hint="entro 15 giorni"
          tone={counters.in_scadenza > 0 ? "warn" : "default"}
          href="/abbonamenti?status=in_scadenza"
        />
        <StatCard
          label="Da attivare"
          value={String(counters.da_attivare)}
          hint="in attesa del primo pagamento"
          tone={counters.da_attivare > 0 ? "neutral" : "default"}
          href="/abbonamenti?status=da_attivare"
        />
        <StatCard
          label="Incassato"
          value={formatEUR(totals.totalCollected)}
          hint={`di cui ${formatEUR(totals.donationsCollected)} in donazioni`}
          href="/pagamenti"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Per servizio"
          action={
            <Link
              href="/servizi"
              className="text-xs font-medium text-[var(--ink-navy)] underline-offset-2 hover:underline"
            >
              Gestisci servizi
            </Link>
          }
        >
          {byService.length === 0 ? (
            <EmptyState title="Nessun abbonamento attivo">
              La ripartizione compare quando c&apos;è almeno un abbonamento attivo.
            </EmptyState>
          ) : (
            <TableWrap>
              <table className="w-full border-collapse">
                <thead className="border-b border-[var(--border)]">
                  <tr>
                    <Th>Servizio</Th>
                    <Th align="right">Attivi</Th>
                    <Th align="right">Per ciclo</Th>
                    <Th align="right">In ritardo</Th>
                  </tr>
                </thead>
                <tbody>
                  {byService.map((row) => (
                    <tr
                      key={row._id}
                      className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface)]"
                    >
                      <Td>
                        <Link
                          href={`/abbonamenti?service=${row._id}`}
                          className="underline-offset-2 hover:underline"
                        >
                          <ServiceMark name={row.name} logo={row.logo} />
                        </Link>
                      </Td>
                      <Td align="right" className="tnum">
                        {row.activeSubscriptions}
                      </Td>
                      <Td align="right" className="tnum font-medium">
                        {formatEUR(row.dueThisCycle)}
                      </Td>
                      <Td align="right" className="tnum">
                        {row.late > 0 ? (
                          <span style={{ color: "var(--status-critical)" }}>{row.late}</span>
                        ) : (
                          "—"
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>

        <Card
          title="Ultimi pagamenti"
          action={
            <Link
              href="/pagamenti"
              className="text-xs font-medium text-[var(--ink-navy)] underline-offset-2 hover:underline"
            >
              Vedi tutti
            </Link>
          }
        >
          {recentPayments.length === 0 ? (
            <EmptyState title="Nessun pagamento registrato">
              I pagamenti compaiono qui appena ne registri uno.
            </EmptyState>
          ) : (
            <TableWrap>
              <table className="w-full border-collapse">
                <thead className="border-b border-[var(--border)]">
                  <tr>
                    <Th>Data</Th>
                    <Th>Persona</Th>
                    <Th align="right">Importo</Th>
                    <Th>Tipo</Th>
                  </tr>
                </thead>
                <tbody>
                  {recentPayments.map((payment) => {
                    const person = payment.person as unknown as {
                      firstName?: string;
                      lastName?: string;
                    } | null;
                    return (
                      <tr
                        key={String(payment._id)}
                        className="border-b border-[var(--border)] last:border-0"
                      >
                        <Td className="tnum whitespace-nowrap">{formatDate(payment.paidAt)}</Td>
                        <Td>
                          {person ? `${person.firstName} ${person.lastName}` : "Persona rimossa"}
                        </Td>
                        <Td align="right" className="tnum font-medium">
                          {formatEUR(payment.amount)}
                        </Td>
                        <Td>
                          {payment.kind === "credito_migrazione" ? (
                            <Pill>Credito migrazione</Pill>
                          ) : (
                            <Pill>{payment.method}</Pill>
                          )}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>
      </div>

      {plannedMigrations.length > 0 ? (
        <Card
          title="Migrazioni in arrivo"
          action={
            <span className="text-xs text-[var(--ink-muted)]">
              Da eseguire a mano alla decorrenza
            </span>
          }
        >
          <TableWrap>
            <table className="w-full border-collapse">
              <thead className="border-b border-[var(--border)]">
                <tr>
                  <Th>Persona</Th>
                  <Th>Passaggio</Th>
                  <Th>Decorrenza</Th>
                  <Th align="right">Saldo</Th>
                </tr>
              </thead>
              <tbody>
                {plannedMigrations.map((sub) => (
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
                    </Td>
                    <Td>
                      {sub.service?.name ?? "—"} verso{" "}
                      {sub.migration?.toService?.name ?? "servizio rimosso"}
                      <MigrationBadge alert={sub.migration?.alert ?? null} />
                    </Td>
                    <Td className="tnum whitespace-nowrap">
                      {formatDate(sub.migration?.effectiveDate ?? null)}
                    </Td>
                    <Td align="right" className="tnum font-medium">
                      {sub.migration?.balance ? formatEUR(sub.migration.balance.saldo) : "—"}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Card>
      ) : null}

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
            Tutti gli abbonamenti attivi sono in regola. Gli abbonamenti compaiono qui quando
            mancano meno di 15 giorni alla scadenza.
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
                    className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface)]"
                  >
                    <Td>
                      {/* Prima era testo morto: da qui si deve poter aprire la scheda
                          e registrare il pagamento, che è l'azione che segue. */}
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
                      <span className="tnum">{formatDate(sub.computed.nextDueDate)}</span>
                      <span className="block text-xs text-[var(--ink-muted)]">
                        {statusDetail(sub.computed.status, sub.computed.daysToDue)}
                      </span>
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

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          label="Persone"
          value={String(registry.people)}
          hint="in anagrafica"
          href="/persone"
        />
        <StatCard
          label="Servizi attivi"
          value={String(registry.activeServices)}
          hint="disponibili per un abbonamento"
          href="/servizi"
        />
      </div>
    </div>
  );
}
