import { connectToDatabase } from "@/lib/mongodb";
import { Person } from "@/models/Person";
import { Subscription } from "@/models/Subscription";
import { Payment } from "@/models/Payment";
import { Service } from "@/models/Service";
import { personUpdateSchema } from "@/lib/validation";
import { ok, fail, handleError, parseBody } from "@/lib/api";
import { computeSubscription } from "@/lib/billing";
import { withAdmin } from "@/lib/requireAdmin";

type Context = { params: Promise<{ id: string }> };

/**
 * GET /api/people/:id — scheda persona con tutti i suoi abbonamenti
 * e il totale dovuto aggregato su tutti i servizi.
 */
async function handleGET(_request: Request, { params }: Context) {
  try {
    await connectToDatabase();
    const { id } = await params;

    const person = await Person.findById(id).lean();
    if (!person) return fail("Persona non trovata", 404);

    const subscriptions = await Subscription.find({ person: id })
      .populate<{ service: { name: string; monthlyRate: number; billingDayOfMonth: number | null } }>(
        "service",
        "name slug monthlyRate billingDayOfMonth"
      )
      .lean();

    // Storico di tutti gli abbonamenti della persona, per il saldo del ciclo.
    const payments = await Payment.find(
      { subscription: { $in: subscriptions.map((sub) => sub._id) } },
      { subscription: 1, amount: 1, periodEnd: 1 }
    ).lean();
    const paymentsBySubscription = new Map<string, { amount: number; periodEnd: Date | null }[]>();
    for (const payment of payments) {
      const key = String(payment.subscription);
      const list = paymentsBySubscription.get(key) ?? [];
      list.push({ amount: payment.amount, periodEnd: payment.periodEnd ?? null });
      paymentsBySubscription.set(key, list);
    }

    const now = new Date();
    const enriched = subscriptions.map((sub) => ({
      ...sub,
      computed: computeSubscription(
        {
          monthlyRate: sub.service?.monthlyRate ?? 0,
          periodicity: sub.periodicity,
          donationSupplement: sub.donationSupplement,
          onboardingStatus: sub.onboardingStatus,
          startDate: sub.startDate,
          lastPaymentDate: sub.lastPaymentDate,
          billingDayOfMonth: sub.service?.billingDayOfMonth,
          payments: paymentsBySubscription.get(String(sub._id)) ?? [],
        },
        now
      ),
    }));

    const totalDue = enriched
      .filter((s) => s.onboardingStatus === "attivo")
      .reduce((sum, s) => sum + s.computed.totalDue, 0);

    return ok({ person, subscriptions: enriched, totalDue });
  } catch (err) {
    return handleError(err);
  }
}

async function handlePATCH(request: Request, { params }: Context) {
  try {
    await connectToDatabase();
    const { id } = await params;
    const { data, error } = await parseBody(request, personUpdateSchema);
    if (error) return error;

    const person = await Person.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    }).lean();
    if (!person) return fail("Persona non trovata", 404);
    return ok(person);
  } catch (err) {
    return handleError(err);
  }
}

/** Eliminabile solo senza abbonamenti collegati: altrimenti si disattiva. */
async function handleDELETE(_request: Request, { params }: Context) {
  try {
    await connectToDatabase();
    const { id } = await params;
    void Service; // il modello deve essere registrato per le populate

    const subs = await Subscription.countDocuments({ person: id });
    if (subs > 0) {
      return fail(
        `Impossibile eliminare: la persona ha ${subs} ${subs === 1 ? "abbonamento" : "abbonamenti"}. Disattivala invece.`,
        409
      );
    }

    const person = await Person.findByIdAndDelete(id).lean();
    if (!person) return fail("Persona non trovata", 404);
    return ok({ deleted: true });
  } catch (err) {
    return handleError(err);
  }
}

export const GET = withAdmin(handleGET);
export const PATCH = withAdmin(handlePATCH);
export const DELETE = withAdmin(handleDELETE);
