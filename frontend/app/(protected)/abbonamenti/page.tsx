import Link from "next/link";
import { requireAdmin } from "@/lib/requireAdmin";
import { listSubscriptions, listServices, listPeople, type SubscriptionView } from "@/lib/queries";
import { NewSubscriptionButton } from "@/components/SubscriptionActions";
import { PageHeader } from "@/components/PageHeader";
import { SubscriptionsTable } from "@/components/SubscriptionsTable";
import { parseSort, sortRows, type SortValue } from "@/lib/sorting";
import { type PaymentStatus } from "@/lib/billing";

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

/**
 * Colonne ordinabili.
 *
 * La persona si ordina per email, non per cognome: l'email è l'identificativo
 * univoco di una persona in SubsMate (indice unico su Person), mentre due
 * omonimi avrebbero la stessa chiave di ordinamento. È anche il dato mostrato
 * sotto il nome nella colonna.
 *
 * Lo stato si ordina per giorni alla scadenza, non in ordine alfabetico
 * dell'etichetta: "in ritardo" prima di "in regola" è l'ordine che serve a chi
 * deve sollecitare.
 */
const SORT_ACCESSORS: Record<string, (sub: SubscriptionView) => SortValue> = {
  persona: (sub) => sub.person?.email ?? null,
  servizio: (sub) => sub.service?.name ?? null,
  periodicita: (sub) => PERIODICITY_LABELS[sub.periodicity] ?? sub.periodicity,
  quota: (sub) => sub.computed.serviceQuota,
  donazione: (sub) => sub.computed.donationSupplement,
  totale: (sub) => sub.computed.totalDue,
  scadenza: (sub) => sub.computed.nextDueDate,
  stato: (sub) => sub.computed.daysToDue,
};

export default async function SubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    service?: string;
    sort?: string;
    dir?: string;
    q?: string;
  }>;
}) {
  await requireAdmin("/abbonamenti");
  const { status, service, sort, dir, q } = await searchParams;
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
  const serviceOptions = services.map((item) => ({
    _id: String(item._id),
    name: item.name,
    donationSupplement: item.donationSupplement ?? 0,
  }));

  // Lo stato è calcolato, non salvato: filtro e ordinamento si applicano dopo il calcolo.
  const filtered =
    status && status !== "tutti"
      ? allSubscriptions.filter((sub) => sub.computed.status === status)
      : allSubscriptions;

  const currentSort = parseSort({ sort, dir }, Object.keys(SORT_ACCESSORS), {
    key: "scadenza",
    dir: "asc",
  });
  const subscriptions = sortRows(filtered, SORT_ACCESSORS[currentSort.key], currentSort.dir);

  // La ricerca testuale non viene applicata qui: la applica il componente
  // dell'elenco, che gira anche sul server al primo render e quindi produce
  // già l'HTML giusto per un link con `?q=`, poi continua a filtrare nel
  // browser mentre si scrive.
  const buildHref = (next: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = { status, service, sort, dir, q, ...next };
    for (const [key, value] of Object.entries(merged)) {
      if (value && value !== "tutti") params.set(key, value);
    }
    const query = params.toString();
    return query ? `/abbonamenti?${query}` : "/abbonamenti";
  };

  return (
    // La tabella ha nove colonne: da lg in su recupera larghezza sfondando i margini
    // laterali del contenitore. I valori restano sotto la larghezza del breakpoint
    // corrispondente, quindi la pagina non può mai scorrere in orizzontale.
    <div className="space-y-6 lg:-mx-4 xl:-mx-10 2xl:-mx-32">
      <PageHeader
        title="Abbonamenti"
        description="Una riga per ogni coppia persona × servizio. Quota, scadenza e stato sono calcolati dall'ultimo pagamento registrato."
        action={<NewSubscriptionButton people={peopleOptions} services={serviceOptions} />}
      />

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
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

      <SubscriptionsTable
        rows={subscriptions}
        totalCount={allSubscriptions.length}
        initialQuery={q ?? ""}
        currentSort={currentSort}
        sortParams={{ status, service }}
        hasFilters={Boolean((status && status !== "tutti") || service)}
      />
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
              ? "rounded-[var(--radius)] bg-[var(--ink-navy)] px-2.5 py-1 text-xs font-medium text-white"
              : "rounded-[var(--radius)] border border-[var(--border)] px-2.5 py-1 text-xs font-medium text-[var(--ink-navy)] hover:bg-[var(--surface)]"
          }
        >
          {option.label}
        </Link>
      ))}
    </div>
  );
}
