import { connectToDatabase } from "@/lib/mongodb";
import { Subscription } from "@/models/Subscription";
import { Payment } from "@/models/Payment";
import { Service } from "@/models/Service";
import { paymentUpdateSchema } from "@/lib/validation";
import { ok, fail, handleError, parseBody } from "@/lib/api";
import { coveredPeriod } from "@/lib/billing";
import { withAdmin } from "@/lib/requireAdmin";

type Context = { params: Promise<{ id: string; paymentId: string }> };

/**
 * PATCH /api/subscriptions/:id/payments/:paymentId — corregge un pagamento
 * già registrato. Si inviano solo i campi che cambiano.
 *
 * Due valori derivano da `paidAt` e vanno rifatti quando la data si sposta:
 *
 * - `periodStart`/`periodEnd` del pagamento, ricalcolati con `coveredPeriod`.
 *   Alla sola creazione non bastava: restavano congelati sulla data sbagliata.
 * - `lastPaymentDate` dell'abbonamento, da cui deriva la prossima scadenza.
 *   Non si incrementa: se il pagamento corretto era quello che definiva la
 *   data e ora arretra, si ripartono dal massimo `paidAt` fra tutti i
 *   pagamenti rimasti. Correggere un pagamento arretrato, che non definiva la
 *   data, non deve invece cambiare nulla — come nel DELETE qui sotto, la
 *   regola è che un pagamento con `paidAt` precedente non fa mai arretrare
 *   `lastPaymentDate`.
 *
 * Non tocca `onboardingStatus`: è gestito manualmente dall'admin.
 */
async function handlePATCH(request: Request, { params }: Context) {
  try {
    await connectToDatabase();
    const { id, paymentId } = await params;

    const { data, error } = await parseBody(request, paymentUpdateSchema);
    if (error) return error;

    const [payment, subscriptionBefore] = await Promise.all([
      Payment.findOne({ _id: paymentId, subscription: id }).lean(),
      Subscription.findById(id).lean(),
    ]);
    if (!payment) return fail("Pagamento non trovato", 404);
    if (!subscriptionBefore) return fail("Abbonamento non trovato", 404);

    const previousPaidAt = new Date(payment.paidAt);
    const nextPaidAt = data.paidAt ?? previousPaidAt;
    const dateChanged = nextPaidAt.getTime() !== previousPaidAt.getTime();

    const changes: Record<string, unknown> = {};
    if (data.amount !== undefined) changes.amount = data.amount;
    if (data.donationAmount !== undefined) changes.donationAmount = data.donationAmount;
    if (data.method !== undefined) changes.method = data.method;
    if (data.reference !== undefined) changes.reference = data.reference;
    if (data.notes !== undefined) changes.notes = data.notes;
    if (dateChanged) {
      // Il giorno di addebito sta sul servizio, non sull'abbonamento: serve
      // solo quando la data cambia, quindi si legge qui e non in apertura.
      const service = await Service.findById(subscriptionBefore.service)
        .select("billingDayOfMonth")
        .lean();
      const { periodStart, periodEnd } = coveredPeriod(
        nextPaidAt,
        subscriptionBefore.periodicity,
        service?.billingDayOfMonth
      );
      changes.paidAt = nextPaidAt;
      changes.periodStart = periodStart;
      changes.periodEnd = periodEnd;
    }

    const updatedPayment = await Payment.findByIdAndUpdate(paymentId, changes, {
      new: true,
      runValidators: true,
    }).lean();
    if (!updatedPayment) return fail("Pagamento non trovato", 404);

    let subscription = subscriptionBefore;
    if (dateChanged) {
      const lastPaymentDate = subscriptionBefore.lastPaymentDate
        ? new Date(subscriptionBefore.lastPaymentDate)
        : null;
      // Definiva la data corrente, quindi spostandolo la scadenza va rifatta.
      const definedCurrentDate =
        !lastPaymentDate || previousPaidAt.getTime() >= lastPaymentDate.getTime();
      const advances = !lastPaymentDate || nextPaidAt.getTime() > lastPaymentDate.getTime();

      if (advances || definedCurrentDate) {
        // Ricalcolo dal massimo rimasto invece di assegnare nextPaidAt: se il
        // pagamento arretra, la data giusta è quella di un altro pagamento.
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
    }

    return ok({ payment: updatedPayment, subscription });
  } catch (err) {
    return handleError(err);
  }
}

/**
 * DELETE /api/subscriptions/:id/payments/:paymentId — cancella un pagamento
 * registrato per errore. Per correggerne i valori c'è la PATCH qui sopra:
 * la cancellazione serve quando il pagamento non doveva esistere, o quando va
 * spostato su un altro abbonamento, cosa che la PATCH non fa.
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

export const PATCH = withAdmin(handlePATCH);
export const DELETE = withAdmin(handleDELETE);
