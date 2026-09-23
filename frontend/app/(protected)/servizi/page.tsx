import { requireAdmin } from "@/lib/requireAdmin";
import { listServices, listSubscriptions } from "@/lib/queries";
import { PageHeader } from "@/components/PageHeader";
import { Card, TableWrap, Th, SortableTh, Td, EmptyState, ServiceMark } from "@/components/ui";
import { parseSort, sortRows, sortHrefBuilder, type SortValue } from "@/lib/sorting";
import { Pill } from "@/components/StatusBadge";
import { formatEUR } from "@/lib/billing";
import { NewServiceButton, ServiceRowActions } from "@/components/ServiceActions";

export const dynamic = "force-dynamic";

export default async function ServicesPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; dir?: string }>;
}) {
  await requireAdmin("/servizi");
  const { sort, dir } = await searchParams;
  const [allServices, subscriptions] = await Promise.all([listServices(), listSubscriptions()]);

  // Quanti abbonati e quanto incassa ogni servizio per ciclo.
  const usage = new Map<string, { subscribers: number; due: number }>();
  for (const sub of subscriptions) {
    if (!sub.service || sub.onboardingStatus !== "attivo") continue;
    const key = String(sub.service._id);
    const current = usage.get(key) ?? { subscribers: 0, due: 0 };
    usage.set(key, {
      subscribers: current.subscribers + 1,
      due: current.due + sub.computed.serviceQuota,
    });
  }

  const usageOf = (id: string) => usage.get(id) ?? { subscribers: 0, due: 0 };

  const SORT_ACCESSORS: Record<string, (service: (typeof allServices)[number]) => SortValue> = {
    servizio: (service) => service.name,
    tariffa: (service) => service.monthlyRate,
    trimestrale: (service) => service.monthlyRate * 3,
    addebito: (service) => service.billingDayOfMonth ?? null,
    abbonati: (service) => usageOf(String(service._id)).subscribers,
    quote: (service) => usageOf(String(service._id)).due,
    stato: (service) => (service.active ? "Attivo" : "Disattivato"),
  };

  const currentSort = parseSort({ sort, dir }, Object.keys(SORT_ACCESSORS), {
    key: "servizio",
    dir: "asc",
  });
  const services = sortRows(allServices, SORT_ACCESSORS[currentSort.key], currentSort.dir);
  const sortHref = sortHrefBuilder("/servizi", {}, currentSort);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Servizi"
        description="Tariffe dei servizi LLM. Aggiungere un servizio non richiede modifiche al codice: è un record in più."
        action={<NewServiceButton />}
      />

      <Card title="Elenco">
        {allServices.length === 0 ? (
          <EmptyState title="Nessun servizio configurato">
            Esegui <code className="font-mono text-xs">python execution/seed_services.py</code>{" "}
            per creare Claude e ChatGPT, oppure usa{" "}
            <code className="font-mono text-xs">POST /api/services</code>.
          </EmptyState>
        ) : (
          <TableWrap>
            <table className="w-full border-collapse">
              <thead className="border-b border-[var(--border)]">
                <tr>
                  <SortableTh sortKey="servizio" current={currentSort} hrefFor={sortHref}>
                    Servizio
                  </SortableTh>
                  <SortableTh
                    sortKey="tariffa"
                    current={currentSort}
                    hrefFor={sortHref}
                    align="right"
                  >
                    Tariffa mensile
                  </SortableTh>
                  <SortableTh
                    sortKey="trimestrale"
                    current={currentSort}
                    hrefFor={sortHref}
                    align="right"
                  >
                    Trimestrale
                  </SortableTh>
                  <SortableTh
                    sortKey="addebito"
                    current={currentSort}
                    hrefFor={sortHref}
                    align="right"
                  >
                    Giorno addebito
                  </SortableTh>
                  <SortableTh
                    sortKey="abbonati"
                    current={currentSort}
                    hrefFor={sortHref}
                    align="right"
                  >
                    Abbonati attivi
                  </SortableTh>
                  <SortableTh
                    sortKey="quote"
                    current={currentSort}
                    hrefFor={sortHref}
                    align="right"
                  >
                    Quote per ciclo
                  </SortableTh>
                  <SortableTh sortKey="stato" current={currentSort} hrefFor={sortHref}>
                    Stato
                  </SortableTh>
                  <Th align="right">Azioni</Th>
                </tr>
              </thead>
              <tbody>
                {services.map((service) => {
                  const stats = usageOf(String(service._id));
                  return (
                    <tr
                      key={String(service._id)}
                      className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface)]"
                    >
                      <Td>
                        <ServiceMark name={service.name} logo={service.logo} />
                      </Td>
                      <Td align="right" className="tnum font-medium">
                        {formatEUR(service.monthlyRate)}
                      </Td>
                      <Td align="right" className="tnum text-[var(--ink-muted)]">
                        {formatEUR(service.monthlyRate * 3)}
                      </Td>
                      <Td align="right" className="tnum">
                        {service.billingDayOfMonth}
                      </Td>
                      <Td align="right" className="tnum">
                        {stats.subscribers}
                      </Td>
                      <Td align="right" className="tnum font-medium">
                        {formatEUR(stats.due)}
                      </Td>
                      <Td>
                        <Pill>{service.active ? "Attivo" : "Disattivato"}</Pill>
                      </Td>
                      <Td align="right">
                        <ServiceRowActions
                          service={{
                            _id: String(service._id),
                            name: service.name,
                            monthlyRate: service.monthlyRate,
                            billingDayOfMonth: service.billingDayOfMonth ?? 18,
                            active: service.active ?? true,
                            notes: service.notes ?? "",
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
        Cambiare la tariffa di un servizio modifica solo il dovuto futuro: i pagamenti già
        registrati conservano l&apos;importo storico.
      </p>
    </div>
  );
}
