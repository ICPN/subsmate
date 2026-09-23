import { connectToDatabase } from "@/lib/mongodb";
import { Subscription } from "@/models/Subscription";
import { Payment } from "@/models/Payment";
import { Person } from "@/models/Person";
import { Service } from "@/models/Service";
import { computeSubscription, type SubscriptionComputation } from "@/lib/billing";
import { serviceLogoFor } from "@/lib/serviceLogo";
import type { Periodicity, OnboardingStatus } from "@/models/Subscription";

/**
 * Letture condivise fra route handler e Server Component.
 * Unica fonte di verità: le pagine non ri-chiamano le API via HTTP.
 */

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

  const now = new Date();
  return subscriptions.map((sub) => {
    const service = sub.service as unknown as SubscriptionView["service"];
    return {
      ...(sub as unknown as SubscriptionView),
      service: service ? { ...service, logo: serviceLogoFor(service.slug) } : null,
      computed: computeSubscription(
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
      ),
    };
  });
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

  return {
    totals: {
      subscriptions: subscriptions.length,
      activeSubscriptions: active.length,
      dueThisCycle: round2(active.reduce((sum, s) => sum + s.computed.totalDue, 0)),
      donationsCollected: round2(donations?.total ?? 0),
      totalCollected: round2(donations?.collected ?? 0),
    },
    counters: {
      in_ritardo: late.length,
      in_scadenza: dueSoon.length,
      da_attivare: toActivate.length,
      in_regola:
        subscriptions.length - late.length - dueSoon.length - toActivate.length,
    },
    // Ordinati per urgenza: scadenza più arretrata in cima.
    attention: [...late, ...dueSoon].sort(
      (a, b) => (a.computed.daysToDue ?? 0) - (b.computed.daysToDue ?? 0)
    ),
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
