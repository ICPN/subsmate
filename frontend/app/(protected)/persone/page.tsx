import Link from "next/link";
import { requireAdmin } from "@/lib/requireAdmin";
import { listPeople, listSubscriptions } from "@/lib/queries";
import { PageHeader } from "@/components/PageHeader";
import { Card, TableWrap, Th, Td, EmptyState, StatCard } from "@/components/ui";
import { Pill } from "@/components/StatusBadge";
import { formatEUR } from "@/lib/billing";
import { NewPersonButton, PersonRowActions } from "@/components/PersonActions";

export const dynamic = "force-dynamic";

export default async function PeoplePage() {
  await requireAdmin("/persone");
  const [people, subscriptions] = await Promise.all([listPeople(), listSubscriptions()]);

  // Aggregato per persona: quanti servizi ha e quanto deve in totale.
  const byPerson = new Map<
    string,
    { count: number; total: number; services: string[]; late: number }
  >();
  for (const sub of subscriptions) {
    if (!sub.person) continue;
    const key = String(sub.person._id);
    const current = byPerson.get(key) ?? { count: 0, total: 0, services: [], late: 0 };
    const isActive = sub.onboardingStatus === "attivo";
    byPerson.set(key, {
      count: current.count + (isActive ? 1 : 0),
      total: current.total + (isActive ? sub.computed.totalDue : 0),
      services: sub.service ? [...current.services, sub.service.name] : current.services,
      late: current.late + (sub.computed.status === "in_ritardo" ? 1 : 0),
    });
  }

  const totalDue = [...byPerson.values()].reduce((sum, entry) => sum + entry.total, 0);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Persone"
        description="Membri del team e totale dovuto sommato su tutti i loro servizi."
        action={<NewPersonButton />}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Persone registrate" value={String(people.length)} />
        <StatCard
          label="Abbonamenti attivi"
          value={String([...byPerson.values()].reduce((sum, e) => sum + e.count, 0))}
        />
        <StatCard label="Dovuto complessivo per ciclo" value={formatEUR(totalDue)} />
      </div>

      <Card title="Elenco">
        {people.length === 0 ? (
          <EmptyState title="Nessuna persona registrata">
            Le persone vengono create dall&apos;import del Google Sheet oppure con{" "}
            <code className="font-mono text-xs">POST /api/people</code>.
          </EmptyState>
        ) : (
          <TableWrap>
            <table className="w-full border-collapse">
              <thead className="border-b border-[var(--border)]">
                <tr>
                  <Th>Nome</Th>
                  <Th>Email</Th>
                  <Th>Servizi</Th>
                  <Th align="right">Abbonamenti attivi</Th>
                  <Th align="right">Totale dovuto</Th>
                  <Th align="right">Azioni</Th>
                </tr>
              </thead>
              <tbody>
                {people.map((person) => {
                  const agg = byPerson.get(String(person._id)) ?? {
                    count: 0,
                    total: 0,
                    services: [],
                    late: 0,
                  };
                  return (
                    <tr
                      key={String(person._id)}
                      className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface)]"
                    >
                      <Td>
                        <span className="font-medium">
                          {person.firstName} {person.lastName}
                        </span>
                        {agg.late > 0 ? (
                          <span
                            className="ml-2 text-xs font-medium"
                            style={{ color: "var(--status-critical)" }}
                          >
                            {agg.late} in ritardo
                          </span>
                        ) : null}
                      </Td>
                      <Td className="text-[var(--ink-muted)]">{person.email}</Td>
                      <Td>
                        <span className="flex flex-wrap gap-1.5">
                          {agg.services.length === 0 ? (
                            <span className="text-[var(--ink-muted)]">—</span>
                          ) : (
                            agg.services.map((name) => <Pill key={name}>{name}</Pill>)
                          )}
                        </span>
                      </Td>
                      <Td align="right" className="tnum">
                        {agg.count}
                      </Td>
                      <Td align="right" className="tnum font-medium">
                        {formatEUR(agg.total)}
                      </Td>
                      <Td align="right">
                        <PersonRowActions
                          person={{
                            _id: String(person._id),
                            firstName: person.firstName,
                            lastName: person.lastName,
                            email: person.email,
                            active: person.active ?? true,
                            notes: person.notes ?? "",
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
      </Card>

      <p className="text-sm text-[var(--ink-muted)]">
        Il dettaglio di un singolo abbonamento si apre dall&apos;elenco{" "}
        <Link href="/abbonamenti" className="underline underline-offset-2">
          Abbonamenti
        </Link>
        .
      </p>
    </div>
  );
}
