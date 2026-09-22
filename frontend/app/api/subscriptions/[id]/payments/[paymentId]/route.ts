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
 * recente, o lo svuota se non ne restano. Non tocca onboardingStatus: è un
 * campo gestito manualmente dall'admin, non va sovrascritto da
 * un'operazione sui pagamenti.
 */
async function handleDELETE(_request: Request, { params }: Context) {
  try {
    await connectToDatabase();
    const { id, paymentId } = await params;

    const payment = await Payment.findOne({ _id: paymentId, subscription: id }).lean();
    if (!payment) return fail("Pagamento non trovato", 404);

    await Payment.findByIdAndDelete(paymentId);

    const mostRecent = await Payment.findOne({ subscription: id })
      .sort({ paidAt: -1 })
      .lean();

    const subscription = await Subscription.findByIdAndUpdate(
      id,
      { lastPaymentDate: mostRecent?.paidAt ?? null },
      { new: true }
    ).lean();
    if (!subscription) return fail("Abbonamento non trovato", 404);

    return ok({ deleted: true, subscription });
  } catch (err) {
    return handleError(err);
  }
}

export const DELETE = withAdmin(handleDELETE);
