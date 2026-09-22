import { listServices, listSubscriptions } from "@/lib/queries";
import { PageHeader } from "@/components/PageHeader";
import { Card, TableWrap, Th, Td, EmptyState, ServiceMark } from "@/components/ui";
import { Pill } from "@/components/StatusBadge";
import { formatEUR } from "@/lib/billing";

export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  const [services, subscriptions] = await Promise.all([listServices(), listSubscriptions()]);

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

  return (
    <div className="space-y-8">
      <PageHeader
        title="Servizi"
        description="Tariffe dei servizi LLM. Aggiungere un servizio non richiede modifiche al codice: è un record in più."
      />

      <Card title="Elenco">
        {services.length === 0 ? (
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
                  <Th>Servizio</Th>
                  <Th align="right">Tariffa mensile</Th>
                  <Th align="right">Trimestrale</Th>
                  <Th align="right">Giorno addebito</Th>
                  <Th align="right">Abbonati attivi</Th>
                  <Th align="right">Quote per ciclo</Th>
                  <Th>Stato</Th>
                </tr>
              </thead>
              <tbody>
                {services.map((service) => {
                  const stats = usage.get(String(service._id)) ?? { subscribers: 0, due: 0 };
                  return (
                    <tr
                      key={String(service._id)}
                      className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface)]"
                    >
                      <Td>
                        <ServiceMark name={service.name} />
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
