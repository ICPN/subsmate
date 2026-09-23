import { connectToDatabase } from "@/lib/mongodb";
import { Subscription } from "@/models/Subscription";
import { Payment } from "@/models/Payment";
import { Person } from "@/models/Person";
import { Service } from "@/models/Service";
import { Migration } from "@/models/Migration";
import { computeSubscription, type SubscriptionComputation } from "@/lib/billing";
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
  const paymentsBySubscription = new Map<string, { amount: number; periodEnd: Date | null }[]>();
  const payments = await Payment.find(
    { subscription: { $in: subscriptions.map((sub) => sub._id) } },
    { subscription: 1, amount: 1, periodEnd: 1 }
  ).lean();
  for (const payment of payments) {
    const key = String(payment.subscription);
    const list = paymentsBySubscription.get(key) ?? [];
    list.push({ amount: payment.amount, periodEnd: payment.periodEnd ?? null });
    paymentsBySubscription.set(key, list);
  }

  // Una query sola per tutte le migrazioni che riguardano questi abbonamenti,
  // come per i pagamenti: niente una-query-per-riga. Le annullate non servono
  // a nessuno dei due usi, avviso e saldo.
  const migrations = await Migration.find({
    fromSubscription: { $in: subscriptions.map((sub) => sub._id) },
    status: { $ne: "annullata" },
  })
    .populate("toService", "name slug monthlyRate")
    .sort({ createdAt: -1 })
    .lean();

  const migrationsBySubscription = new Map<string, (typeof migrations)[number]>();
  for (const migration of migrations) {
    const key = String(migration.fromSubscription);
    // La più recente vince: le precedenti sono storia già chiusa.
    if (!migrationsBySubscription.has(key)) migrationsBySubscription.set(key, migration);
  }

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
                  oldPaidForCurrentCycle: computed.paidForCurrentCycle,
                  newMonthlyRate: toService.monthlyRate,
                  newPeriodicity: raw.toPeriodicity ?? sub.periodicity,
                  donationSupplement: sub.donationSupplement,
                })
              : null,
        }
      : null;

    return {
      ...(sub as unknown as SubscriptionView),
      service: service ? { ...service, logo: serviceLogoFor(service.slug) } : null,
      computed,
      migration,
    };
  });
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

  // Il credito di migrazione è denaro già contato sul vecchio abbonamento:
  // chiude il ciclo del nuovo ma non è un incasso, e sommarlo qui lo
  // conterebbe due volte. `$ne` e non `$eq: "incasso"` perché i pagamenti
  // scritti prima di questo campo non hanno `kind` in documento: il default
  // di Mongoose vale alla scrittura, non retroattivamente.
  const [donations] = await Payment.aggregate([
    { $match: { kind: { $ne: "credito_migrazione" } } },
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
      in_regola:
        subscriptions.length - late.length - dueSoon.length - toActivate.length,
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
