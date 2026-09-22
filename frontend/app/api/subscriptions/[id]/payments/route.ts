import { connectToDatabase } from "@/lib/mongodb";
import { Subscription } from "@/models/Subscription";
import { Payment } from "@/models/Payment";
import { paymentCreateSchema } from "@/lib/validation";
import { ok, fail, handleError, parseBody } from "@/lib/api";
import { coveredPeriod, totalDue } from "@/lib/billing";
import { withAdmin } from "@/lib/requireAdmin";

type Context = { params: Promise<{ id: string }> };

/** GET /api/subscriptions/:id/payments — storico pagamenti dell'abbonamento. */
async function handleGET(_request: Request, { params }: Context) {
  try {
    await connectToDatabase();
    const { id } = await params;
    const payments = await Payment.find({ subscription: id }).sort({ paidAt: -1 }).lean();
    return ok(payments);
  } catch (err) {
    return handleError(err);
  }
}

/**
 * POST /api/subscriptions/:id/payments — registra un pagamento.
 * Aggiunge la riga allo storico e aggiorna lastPaymentDate, da cui deriva
 * la prossima scadenza. Importo e donazione, se omessi, si calcolano dalla
 * tariffa del servizio e dal supplemento configurato.
 */
async function handlePOST(request: Request, { params }: Context) {
  try {
    await connectToDatabase();
    const { id } = await params;

    const { data, error } = await parseBody(
      request,
      paymentCreateSchema.omit({ subscription: true })
    );
    if (error) return error;

    const subscription = await Subscription.findById(id)
      .populate<{ service: { monthlyRate: number } }>("service", "monthlyRate")
      .lean();
    if (!subscription) return fail("Abbonamento non trovato", 404);

    const monthlyRate = subscription.service?.monthlyRate ?? 0;
    const paidAt = data.paidAt ?? new Date();
    const amount =
      data.amount ??
      totalDue(monthlyRate, subscription.periodicity, subscription.donationSupplement);
    const donationAmount = data.donationAmount ?? subscription.donationSupplement ?? 0;
    const { periodStart, periodEnd } = coveredPeriod(paidAt, subscription.periodicity);

    const payment = await Payment.create({
      subscription: id,
      person: subscription.person,
      amount,
      donationAmount,
      paidAt,
      method: data.method ?? "bonifico",
      periodStart,
      periodEnd,
      reference: data.reference ?? "",
      notes: data.notes ?? "",
    });

    // Avanza lastPaymentDate solo se il pagamento è più recente di quello registrato:
    // permette di inserire pagamenti arretrati senza falsare la prossima scadenza.
    const shouldAdvance =
      !subscription.lastPaymentDate || paidAt > new Date(subscription.lastPaymentDate);

    const updated = await Subscription.findByIdAndUpdate(
      id,
      {
        ...(shouldAdvance ? { lastPaymentDate: paidAt } : {}),
        // Il primo pagamento attiva automaticamente l'abbonamento.
        ...(subscription.onboardingStatus === "da_attivare"
          ? { onboardingStatus: "attivo", startDate: subscription.startDate ?? paidAt }
          : {}),
      },
      { new: true }
    ).lean();

    return ok({ payment, subscription: updated }, 201);
  } catch (err) {
    return handleError(err);
  }
}

export const GET = withAdmin(handleGET);
export const POST = withAdmin(handlePOST);
