import type { Types } from "mongoose";
import { connectToDatabase } from "@/lib/mongodb";
import { Subscription } from "@/models/Subscription";
import { Payment } from "@/models/Payment";
import { Person } from "@/models/Person";
import { Service } from "@/models/Service";
import { Migration } from "@/models/Migration";
import {
  CREDIT_KINDS,
  availableFirstCycleCredit,
  computeSubscription,
  type SubscriptionComputation,
} from "@/lib/billing";
import {
  migrationAlert,
  migrationBalance,
  type MigrationAlert,
  type MigrationBalance,
  type MigrationCloseOld,
  type MigrationStatus,
} from "@/lib/migration";
import { serviceLogoFor } from "@/lib/serviceLogo";
import type { Periodicity, OnboardingStatus } from "@/models/Subscription";
import type { PaymentSubscriptionOption } from "@/components/RegisterPaymentForm";

/**
 * Letture condivise fra route handler e Server Component.
 * Unica fonte di verità: le pagine non ri-chiamano le API via HTTP.
 */

export interface MigrationView {
  _id: string;
  toService: {
    _id: string;
    name: string;
    slug: string;
    monthlyRate: number;
    donationSupplement: number;
    logo: string | null;
  } | null;
  effectiveDate: Date;
  closeOld: MigrationCloseOld;
  /** Periodicità scelta per il nuovo abbonamento, null se resta la stessa. */
  toPeriodicity: Periodicity | null;
  status: MigrationStatus;
  /** Avviso derivato: null quando non c'è nulla da segnalare. */
  alert: MigrationAlert | null;
  /** Saldo ricalcolato a ogni lettura, mai lo snapshot salvato. */
  balance: MigrationBalance | null;
}

export interface SubscriptionView {
  _id: string;
  person: { _id: string; firstName: string; lastName: string; email: string } | null;
  service: {
    _id: string;
    name: string;
    slug: string;
    monthlyRate: number;
    billingDayOfMonth: number | null;
    /** Percorso del logo in /public, o null se il servizio non ne ha uno. */
    logo: string | null;
  } | null;
  periodicity: Periodicity;
  donationSupplement: number;
  onboardingStatus: OnboardingStatus;
  startDate: Date | null;
  lastPaymentDate: Date | null;
  /** Addebito del fornitore per il primo mese, se inserito. */
  firstCycleProviderCharge: number | null;
  /** Credito del primo mese ancora da spendere: calcolato, mai salvato. */
  firstCycleCreditAvailable: number;
  notes: string;
  computed: SubscriptionComputation;
  /** Migrazione pianificata o appena eseguita che riguarda questo abbonamento. */
  migration: MigrationView | null;
}

/** Abbonamenti con quota, scadenza e stato già calcolati. */
export async function listSubscriptions(
  filter: Record<string, unknown> = {}
): Promise<SubscriptionView[]> {
  await connectToDatabase();
  void Person;
  void Service;

  const subscriptions = await Subscription.find(filter)
    .populate("person", "firstName lastName email")
    .populate("service", "name slug monthlyRate billingDayOfMonth")
    .sort({ createdAt: -1 })
    .lean();

  // I pagamenti servono a sapere quanto è già stato incassato per il ciclo in
  // corso: un versamento parziale non chiude il ciclo, e va segnalato. Una sola
  // query per tutti gli abbonamenti invece di una per riga.
  const paymentsBySubscription = new Map<
    string,
    { amount: number; paidAt: Date | null; periodStart: Date | null }[]
  >();
  const payments = await Payment.find(
    { subscription: { $in: subscriptions.map((sub) => sub._id) } },
    { subscription: 1, amount: 1, paidAt: 1, periodStart: 1, kind: 1 }
  ).lean();
  for (const payment of payments) {
    const key = String(payment.subscription);
    const list = paymentsBySubscription.get(key) ?? [];
    list.push({
      amount: payment.amount,
      paidAt: payment.paidAt ?? null,
      periodStart: payment.periodStart ?? null,
    });
    paymentsBySubscription.set(key, list);
  }

  // Una query sola per tutte le migrazioni che riguardano questi abbonamenti,
  // come per i pagamenti: niente una-query-per-riga. Le annullate non servono
  // a nessuno dei due usi, avviso e saldo.
  const migrations = await Migration.find({
    fromSubscription: { $in: subscriptions.map((sub) => sub._id) },
    status: { $ne: "annullata" },
  })
    .populate("toService", "name slug monthlyRate donationSupplement")
    .sort({ createdAt: -1 })
    .lean();

  const migrationsBySubscription = new Map<string, (typeof migrations)[number]>();
  for (const migration of migrations) {
    const key = String(migration.fromSubscription);
    // La più recente vince: le precedenti sono storia già chiusa.
    if (!migrationsBySubscription.has(key)) migrationsBySubscription.set(key, migration);
  }

  const creditByPerson = await firstCycleCreditByPerson(
    subscriptions.map((sub) => (sub.person as unknown as { _id: Types.ObjectId } | null)?._id)
  );

  const now = new Date();
  return subscriptions.map((sub) => {
    const service = sub.service as unknown as SubscriptionView["service"];
    const computed = computeSubscription(
      {
        monthlyRate: service?.monthlyRate ?? 0,
        periodicity: sub.periodicity,
        donationSupplement: sub.donationSupplement,
        onboardingStatus: sub.onboardingStatus,
        startDate: sub.startDate,
        lastPaymentDate: sub.lastPaymentDate,
        billingDayOfMonth: service?.billingDayOfMonth,
        payments: paymentsBySubscription.get(String(sub._id)) ?? [],
      },
      now
    );

    const personId = (sub.person as unknown as { _id: unknown } | null)?._id;
    const firstCycleCreditAvailable = personId ? (creditByPerson.get(String(personId)) ?? 0) : 0;

    const raw = migrationsBySubscription.get(String(sub._id));
    const toService = raw?.toService as unknown as MigrationView["toService"];
    const migration: MigrationView | null = raw
      ? {
          _id: String(raw._id),
          // _id va convertito a mano: lo spread copia l'ObjectId del driver,
          // che ha un toJSON e non attraversa il confine verso un Client
          // Component (il banner). Il typecheck non lo vede perche il
          // documento lean e castato a MigrationView["toService"].
          toService: toService
            ? {
                ...toService,
                _id: String(toService._id),
                logo: serviceLogoFor(toService.slug),
              }
            : null,
          effectiveDate: raw.effectiveDate,
          closeOld: raw.closeOld,
          toPeriodicity: raw.toPeriodicity ?? null,
          status: raw.status,
          alert: migrationAlert(
            {
              status: raw.status,
              effectiveDate: raw.effectiveDate,
              closeOld: raw.closeOld,
              oldNextDueDate: computed.nextDueDate,
              oldStillActive: sub.onboardingStatus === "attivo",
            },
            now
          ),
          // Solo finché è pianificata: dopo l'esecuzione il vecchio
          // abbonamento è cessato e il saldo non è più ricostruibile da qui.
          balance:
            raw.status === "pianificata" && toService
              ? migrationBalance({
                  effectiveDate: raw.effectiveDate,
                  closeOld: raw.closeOld,
                  oldNextDueDate: computed.nextDueDate,
                  oldMonthlyRate: service?.monthlyRate ?? 0,
                  oldPeriodicity: sub.periodicity,
                  oldPaidForCurrentCycle: computed.paidForCurrentCycle,
                  oldDonationSupplement: sub.donationSupplement,
                  newMonthlyRate: toService.monthlyRate,
                  newPeriodicity: raw.toPeriodicity ?? sub.periodicity,
                  // Chi non dona resta a zero; chi dona passa all'importo del
                  // servizio di destinazione, che è diverso da quello attuale.
                  newDonationSupplement:
                    sub.donationSupplement > 0 ? (toService.donationSupplement ?? 0) : 0,
                  firstCycleCredit: firstCycleCreditAvailable,
                })
              : null,
        }
      : null;

    // Gli _id vanno convertiti a mano, come già per la migrazione: lo spread
    // copia gli ObjectId del driver, che hanno un toJSON e non attraversano il
    // confine verso un Client Component (l'elenco con la ricerca). Il
    // typecheck non se ne accorge perché il documento lean è castato a
    // SubscriptionView, che li dichiara già stringhe.
    const person = sub.person as unknown as SubscriptionView["person"];
    return {
      ...(sub as unknown as SubscriptionView),
      _id: String(sub._id),
      person: person ? { ...person, _id: String(person._id) } : null,
      service: service
        ? { ...service, _id: String(service._id), logo: serviceLogoFor(service.slug) }
        : null,
      firstCycleProviderCharge: sub.firstCycleProviderCharge ?? null,
      firstCycleCreditAvailable,
      computed,
      migration,
    };
  });
}

/**
 * Abbonamento ridotto a ciò che serve al modulo di pagamento e al sollecito.
 * Una sola mappatura per la pagina Pagamenti e la scheda abbonamento.
 */
export function paymentOption(sub: SubscriptionView): PaymentSubscriptionOption {
  return {
    _id: sub._id,
    personId: sub.person?._id ?? "",
    firstName: sub.person?.firstName ?? "",
    personName: sub.person ? `${sub.person.lastName} ${sub.person.firstName}` : "Persona rimossa",
    email: sub.person?.email ?? "",
    serviceName: sub.service?.name ?? "Servizio rimosso",
    serviceLogo: sub.service?.logo ?? null,
    totalDue: sub.computed.totalDue,
    outstanding: sub.computed.outstanding,
    donationSupplement: sub.donationSupplement,
    firstCycleCredit: sub.firstCycleCreditAvailable,
    paidForCurrentCycle: sub.computed.paidForCurrentCycle,
    nextDueDate: sub.computed.nextDueDate?.toISOString() ?? null,
    periodicity: sub.periodicity,
    billingDayOfMonth: sub.service?.billingDayOfMonth ?? null,
    status: sub.computed.status,
  };
}

/**
 * Credito del primo mese ancora disponibile per persona. È della persona, non
 * dell'abbonamento che l'ha generato: chi ha ChatGPT e Claude lo spende anche
 * su Claude. Credito di tutti i suoi abbonamenti, meno le righe
 * "credito_primo_mese" su qualunque abbonamento, meno quanto portato via dalle
 * migrazioni eseguite.
 *
 * In sequenza e non in parallelo: la usano anche le rotte che scrivono in
 * transazione, e una transazione non accetta operazioni parallele.
 */
async function firstCycleCreditByPerson(
  personIds: (string | Types.ObjectId | null | undefined)[]
): Promise<Map<string, number>> {
  const ids = personIds.filter((id): id is string | Types.ObjectId => Boolean(id));
  const credits = new Map<string, number>();
  const used = new Map<string, number[]>();
  if (ids.length === 0) return new Map();

  const sources = await Subscription.find(
    { person: { $in: ids }, firstCycleCredit: { $gt: 0 } },
    { person: 1, firstCycleCredit: 1 }
  ).lean();
  for (const sub of sources) {
    const key = String(sub.person);
    credits.set(key, (credits.get(key) ?? 0) + (sub.firstCycleCredit ?? 0));
  }
  if (credits.size === 0) return new Map();

  const spent = await Payment.find(
    { person: { $in: ids }, kind: "credito_primo_mese" },
    { person: 1, amount: 1 }
  ).lean();
  const transferred = await Migration.find(
    { person: { $in: ids }, status: "eseguita", firstCycleCreditTransferred: { $gt: 0 } },
    { person: 1, firstCycleCreditTransferred: 1 }
  ).lean();
  for (const [person, amount] of [
    ...spent.map((payment) => [String(payment.person), payment.amount] as const),
    ...transferred.map(
      (migration) => [String(migration.person), migration.firstCycleCreditTransferred ?? 0] as const
    ),
  ]) {
    used.set(person, [...(used.get(person) ?? []), amount]);
  }

  return new Map(
    [...credits].map(([person, credit]) => [
      person,
      availableFirstCycleCredit(credit, used.get(person) ?? []),
    ])
  );
}

/** Credito del primo mese disponibile per una persona, per le rotte che scrivono. */
export async function getFirstCycleCreditAvailable(personId: string | Types.ObjectId): Promise<number> {
  await connectToDatabase();
  return (await firstCycleCreditByPerson([personId])).get(String(personId)) ?? 0;
}

/**
 * Singola migrazione, per le rotte che devono rispondere con lo stato
 * aggiornato. Riusa `listSubscriptions` invece di ricalcolare saldo e avviso,
 * così esiste una sola versione di quel calcolo.
 *
 * Quella funzione però espone la migrazione *corrente* dell'abbonamento, la
 * più recente fra le non annullate: se nel frattempo ne fosse nata un'altra,
 * risponderebbe su un documento diverso da quello chiesto. Il confronto sugli
 * id lo impedisce — meglio nessuna risposta che la risposta sbagliata.
 */
export async function getMigration(id: string): Promise<MigrationView | null> {
  await connectToDatabase();
  const migration = await Migration.findById(id).lean();
  if (!migration) return null;

  const [subscription] = await listSubscriptions({ _id: migration.fromSubscription });
  const view = subscription?.migration ?? null;
  return view && view._id === String(migration._id) ? view : null;
}

export async function listPeople() {
  await connectToDatabase();
  return Person.find().sort({ lastName: 1, firstName: 1 }).lean();
}

export async function listServices() {
  await connectToDatabase();
  const services = await Service.find().sort({ name: 1 }).lean();
  return services.map((service) => ({ ...service, logo: serviceLogoFor(service.slug) }));
}

/**
 * Storico pagamenti, dal più recente. Senza `limit` li legge tutti: la pagina
 * Pagamenti ordina e pagina in memoria (vedi `lib/pagination.ts`), quindi un
 * taglio qui le nasconderebbe le righe oltre il limite e falserebbe i totali.
 * Il parametro resta per chi vuole solo gli ultimi n.
 */
export async function listPayments(limit?: number) {
  await connectToDatabase();
  void Person;
  const query = Payment.find()
    .populate("person", "firstName lastName email")
    .sort({ paidAt: -1 });
  return (limit ? query.limit(limit) : query).lean();
}

/** Riga della ripartizione per servizio mostrata in dashboard. */
export interface DashboardServiceRow {
  _id: string;
  name: string;
  slug: string;
  logo: string | null;
  activeSubscriptions: number;
  dueThisCycle: number;
  late: number;
}

/** Aggregati della dashboard: totali del ciclo, contatori di stato, lista da seguire. */
export async function getDashboardData() {
  const subscriptions = await listSubscriptions();

  const active = subscriptions.filter((s) => s.onboardingStatus === "attivo");
  const late = subscriptions.filter((s) => s.computed.status === "in_ritardo");
  const dueSoon = subscriptions.filter((s) => s.computed.status === "in_scadenza");
  const toActivate = subscriptions.filter((s) => s.computed.status === "da_attivare");
  const inOrder = subscriptions.filter((s) => s.computed.status === "in_regola");

  // I crediti (migrazione, primo mese) sono denaro già contato altrove:
  // chiudono un ciclo ma non sono un incasso, e sommarli qui li conterebbe
  // due volte. `$nin` e non `$eq: "incasso"` perché i pagamenti scritti
  // prima di questo campo non hanno `kind` in documento: il default di
  // Mongoose vale alla scrittura, non retroattivamente.
  const [donations] = await Payment.aggregate([
    { $match: { kind: { $nin: CREDIT_KINDS } } },
    { $group: { _id: null, total: { $sum: "$donationAmount" }, collected: { $sum: "$amount" } } },
  ]);

  // Ripartizione per servizio: la domanda è «quanto ci costa Claude rispetto
  // a ChatGPT», e la risposta va derivata qui come tutto il resto. Solo gli
  // attivi, come il dovuto del ciclo: un cessato non costa più nulla.
  const byServiceMap = new Map<string, DashboardServiceRow>();
  for (const sub of active) {
    if (!sub.service) continue;
    const key = String(sub.service._id);
    const row =
      byServiceMap.get(key) ??
      {
        _id: key,
        name: sub.service.name,
        slug: sub.service.slug,
        logo: sub.service.logo,
        activeSubscriptions: 0,
        dueThisCycle: 0,
        late: 0,
      };
    row.activeSubscriptions += 1;
    row.dueThisCycle = round2(row.dueThisCycle + sub.computed.totalDue);
    if (sub.computed.status === "in_ritardo") row.late += 1;
    byServiceMap.set(key, row);
  }

  const [recentPayments, peopleCount, activeServicesCount] = await Promise.all([
    listPayments(5),
    Person.estimatedDocumentCount(),
    Service.countDocuments({ active: true }),
  ]);

  return {
    totals: {
      subscriptions: subscriptions.length,
      activeSubscriptions: active.length,
      dueThisCycle: round2(active.reduce((sum, s) => sum + s.computed.totalDue, 0)),
      // Quanto manca davvero: il dovuto pieno non tiene conto dei versamenti
      // parziali già incassati, ed è un numero più alto che non corrisponde
      // a niente che si possa ancora chiedere a qualcuno.
      outstanding: round2(active.reduce((sum, s) => sum + s.computed.outstanding, 0)),
      donationsCollected: round2(donations?.total ?? 0),
      totalCollected: round2(donations?.collected ?? 0),
    },
    byService: [...byServiceMap.values()].sort((a, b) => b.dueThisCycle - a.dueThisCycle),
    recentPayments,
    // Solo le pianificate: le eseguite sono storia, e l'avviso serve a
    // ricordare che qualcosa va fatto a mano prima della decorrenza.
    plannedMigrations: subscriptions.filter((sub) => sub.migration?.status === "pianificata"),
    registry: { people: peopleCount, activeServices: activeServicesCount },
    counters: {
      in_ritardo: late.length,
      in_scadenza: dueSoon.length,
      da_attivare: toActivate.length,
      // Contati, non ricavati per differenza: i cessati non sono in regola.
      in_regola: inOrder.length,
    },
    // Ordinati per urgenza: scadenza più arretrata in cima. Entrano anche gli
    // abbonamenti con una migrazione da seguire, che possono essere in regola
    // sui pagamenti e avere comunque qualcosa da fare entro pochi giorni.
    attention: [
      ...late,
      ...dueSoon,
      ...subscriptions.filter(
        (sub) =>
          sub.migration?.alert &&
          !late.includes(sub) &&
          !dueSoon.includes(sub)
      ),
    ].sort((a, b) => (a.computed.daysToDue ?? 0) - (b.computed.daysToDue ?? 0)),
  };
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Dettaglio di un singolo abbonamento con il suo storico pagamenti. */
export async function getSubscriptionDetail(id: string) {
  const [subscription] = await listSubscriptions({ _id: id });
  if (!subscription) return null;

  const payments = await Payment.find({ subscription: id }).sort({ paidAt: -1 }).lean();
  return { subscription, payments };
}
