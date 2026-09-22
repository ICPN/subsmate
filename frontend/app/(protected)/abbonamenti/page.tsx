import Link from "next/link";
import { requireAdmin } from "@/lib/requireAdmin";
import { listSubscriptions, listServices, listPeople } from "@/lib/queries";
import { NewSubscriptionButton, SubscriptionRowActions } from "@/components/SubscriptionActions";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge, Pill } from "@/components/StatusBadge";
import { Card, TableWrap, Th, Td, EmptyState, ServiceMark } from "@/components/ui";
import { formatEUR, formatDate, statusDetail, toDateInputValue, type PaymentStatus } from "@/lib/billing";

export const dynamic = "force-dynamic";

const PERIODICITY_LABELS: Record<string, string> = {
  monthly: "Mensile",
  quarterly: "Trimestrale",
};

const STATUS_FILTERS: { value: PaymentStatus | "tutti"; label: string }[] = [
  { value: "tutti", label: "Tutti" },
  { value: "in_ritardo", label: "In ritardo" },
  { value: "in_scadenza", label: "In scadenza" },
  { value: "in_regola", label: "In regola" },
  { value: "da_attivare", label: "Da attivare" },
];

export default async function SubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; service?: string }>;
}) {
  await requireAdmin("/abbonamenti");
  const { status, service } = await searchParams;
  const [allSubscriptions, services, people] = await Promise.all([
    listSubscriptions(service ? { service } : {}),
    listServices(),
    listPeople(),
  ]);

  const peopleOptions = people.map((person) => ({
    _id: String(person._id),
    firstName: person.firstName,
    lastName: person.lastName,
    email: person.email,
  }));
  const serviceOptions = services.map((item) => ({ _id: String(item._id), name: item.name }));

  // Lo stato è calcolato, non salvato: il filtro si applica dopo il calcolo.
  const subscriptions =
    status && status !== "tutti"
      ? allSubscriptions.filter((sub) => sub.computed.status === status)
      : allSubscriptions;

  const buildHref = (next: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = { status, service, ...next };
    for (const [key, value] of Object.entries(merged)) {
      if (value && value !== "tutti") params.set(key, value);
    }
    const query = params.toString();
    return query ? `/abbonamenti?${query}` : "/abbonamenti";
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Abbonamenti"
        description="Una riga per ogni coppia persona × servizio. Quota, scadenza e stato sono calcolati dall'ultimo pagamento registrato."
        action={<NewSubscriptionButton people={peopleOptions} services={serviceOptions} />}
      />

      <div className="flex flex-wrap items-center gap-6">
        <FilterGroup
          legend="Stato"
          options={STATUS_FILTERS.map((option) => ({
            label: option.label,
            href: buildHref({ status: option.value }),
            active: (status ?? "tutti") === option.value,
          }))}
        />
        {services.length > 0 ? (
          <FilterGroup
            legend="Servizio"
            options={[
              { label: "Tutti", href: buildHref({ service: undefined }), active: !service },
              ...services.map((item) => ({
                label: item.name,
                href: buildHref({ service: String(item._id) }),
                active: service === String(item._id),
              })),
            ]}
          />
        ) : null}
      </div>

      <Card
        action={
          <span className="text-xs text-[var(--ink-muted)]">
            {subscriptions.length} di {allSubscriptions.length} abbonamenti
          </span>
        }
        title="Elenco"
      >
        {subscriptions.length === 0 ? (
          <EmptyState title="Nessun abbonamento da mostrare">
            {allSubscriptions.length === 0 ? (
              <>
                Importa i dati esistenti dal Google Sheet con{" "}
                <code className="font-mono text-xs">execution/import_subs_from_sheet.py</code>,
                oppure creane uno con <code className="font-mono text-xs">POST /api/subscriptions</code>.
              </>
            ) : (
              "Nessun abbonamento corrisponde ai filtri selezionati."
            )}
          </EmptyState>
        ) : (
          <TableWrap>
            <table className="w-full border-collapse">
              <thead className="border-b border-[var(--border)]">
                <tr>
                  <Th>Persona</Th>
                  <Th>Servizio</Th>
                  <Th>Periodicità</Th>
                  <Th align="right">Quota</Th>
                  <Th align="right">Donazione</Th>
                  <Th align="right">Totale</Th>
                  <Th>Scadenza</Th>
                  <Th>Stato</Th>
                  <Th align="right">Azioni</Th>
                </tr>
              </thead>
              <tbody>
                {subscriptions.map((sub) => (
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
                      <span className="block text-xs text-[var(--ink-muted)]">
                        {sub.person?.email}
                      </span>
                    </Td>
                    <Td>{sub.service ? <ServiceMark name={sub.service.name} /> : "—"}</Td>
                    <Td>
                      <Pill>{PERIODICITY_LABELS[sub.periodicity] ?? sub.periodicity}</Pill>
                    </Td>
                    <Td align="right" className="tnum">
                      {formatEUR(sub.computed.serviceQuota)}
                    </Td>
                    <Td align="right" className="tnum">
                      {sub.computed.donationSupplement > 0
                        ? formatEUR(sub.computed.donationSupplement)
                        : "—"}
                    </Td>
                    <Td align="right" className="tnum font-medium">
                      {formatEUR(sub.computed.totalDue)}
                    </Td>
                    <Td>
                      <span className="tnum">{formatDate(sub.computed.nextDueDate)}</span>
                      <span className="block text-xs text-[var(--ink-muted)]">
                        {statusDetail(sub.computed.status, sub.computed.daysToDue)}
                      </span>
                    </Td>
                    <Td>
                      <StatusBadge status={sub.computed.status} />
                    </Td>
                    <Td align="right">
                      <SubscriptionRowActions
                        subscription={{
                          _id: String(sub._id),
                          person: sub.person ? String(sub.person._id) : "",
                          personLabel: sub.person
                            ? `${sub.person.firstName} ${sub.person.lastName} — ${sub.person.email}`
                            : "Persona rimossa",
                          service: sub.service ? String(sub.service._id) : "",
                          serviceLabel: sub.service?.name ?? "Servizio rimosso",
                          periodicity: sub.periodicity,
                          donationSupplement: sub.donationSupplement,
                          onboardingStatus: sub.onboardingStatus,
                          startDate: toDateInputValue(sub.startDate),
                          notes: sub.notes ?? "",
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
  );
}

/** Gruppo di filtri come link: lo stato del filtro resta nell'URL, condivisibile. */
function FilterGroup({
  legend,
  options,
}: {
  legend: string;
  options: { label: string; href: string; active: boolean }[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-[var(--ink-muted)]">{legend}</span>
      {options.map((option) => (
        <Link
          key={option.href + option.label}
          href={option.href}
          aria-current={option.active ? "true" : undefined}
          className={
            option.active
              ? "rounded-[var(--radius)] bg-[var(--ink-navy)] px-3 py-1.5 text-xs font-medium text-white"
              : "rounded-[var(--radius)] border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--ink-navy)] hover:bg-[var(--surface)]"
          }
        >
          {option.label}
        </Link>
      ))}
    </div>
  );
}
