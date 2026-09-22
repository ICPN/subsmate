import { connectToDatabase } from "@/lib/mongodb";
import { Subscription } from "@/models/Subscription";
import { Payment } from "@/models/Payment";
import { ok, fail, handleError } from "@/lib/api";
import { withAdmin } from "@/lib/requireAdmin";

type Context = { params: Promise<{ id: string; paymentId: string }> };

/**
 * DELETE /api/subscriptions/:id/payments/:paymentId — cancella un pagamento
 * registrato per errore (correzione = cancella e reinserisci, mai modifica).
 * Ricalcola lastPaymentDate dell'abbonamento sul pagamento rimasto più
 * recente SOLO se il pagamento cancellato era quello che definiva la data
 * corrente (payment.paidAt >= subscription.lastPaymentDate). Lo script di
 * import può creare abbonamenti con un lastPaymentDate "orfano" (riga del
 * foglio con data ma importo mancante: la subscription prende la data, il
 * Payment non viene creato) — cancellando un pagamento più vecchio di quella
 * data, un ricalcolo incondizionato la farebbe arretrare, violando la regola
 * per cui un pagamento con paidAt precedente non fa mai arretrare
 * lastPaymentDate. Non tocca onboardingStatus: è un campo gestito
 * manualmente dall'admin, non va sovrascritto da un'operazione sui pagamenti.
 */
async function handleDELETE(_request: Request, { params }: Context) {
  try {
    await connectToDatabase();
    const { id, paymentId } = await params;

    const [payment, subscriptionBefore] = await Promise.all([
      Payment.findOne({ _id: paymentId, subscription: id }).lean(),
      Subscription.findById(id).lean(),
    ]);
    if (!payment) return fail("Pagamento non trovato", 404);
    if (!subscriptionBefore) return fail("Abbonamento non trovato", 404);

    await Payment.findByIdAndDelete(paymentId);

    const definedCurrentDate =
      !subscriptionBefore.lastPaymentDate ||
      new Date(payment.paidAt).getTime() >= new Date(subscriptionBefore.lastPaymentDate).getTime();

    let subscription = subscriptionBefore;
    if (definedCurrentDate) {
      const mostRecent = await Payment.findOne({ subscription: id })
        .sort({ paidAt: -1 })
        .lean();

      const updated = await Subscription.findByIdAndUpdate(
        id,
        { lastPaymentDate: mostRecent?.paidAt ?? null },
        { new: true }
      ).lean();
      if (!updated) return fail("Abbonamento non trovato", 404);
      subscription = updated;
    }

    return ok({ deleted: true, subscription });
  } catch (err) {
    return handleError(err);
  }
}

export const DELETE = withAdmin(handleDELETE);
