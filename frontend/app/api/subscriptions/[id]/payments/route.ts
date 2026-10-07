import { connectToDatabase, inTransaction } from "@/lib/mongodb";
import { Subscription } from "@/models/Subscription";
import { Payment } from "@/models/Payment";
import { paymentCreateSchema, type PaymentInput } from "@/lib/validation";
import { ok, fail, handleError, parseBody } from "@/lib/api";
import {
  coveredPeriod,
  formatEUR,
  nextDueDate,
  paidForCycle,
  totalDue,
} from "@/lib/billing";
import { withAdmin } from "@/lib/requireAdmin";
import { getFirstCycleCreditAvailable } from "@/lib/queries";

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

    // Tutto in una transazione: incasso, credito e scadenza si scrivono
    // insieme o per niente.
    return await inTransaction(() => registerPayment(id, data));
  } catch (err) {
    return handleError(err);
  }
}

async function registerPayment(
  id: string,
  data: Omit<PaymentInput, "subscription">
) {
  // La prima scrittura tocca l'abbonamento: due pagamenti simultanei sullo
  // stesso abbonamento entrano in conflitto qui, e il secondo riparte da capo
  // dopo il primo, rileggendo credito e storico. Senza, leggerebbero lo stesso
  // credito disponibile e lo spenderebbero due volte.
  const subscription = await Subscription.findByIdAndUpdate(
    id,
    { $set: { updatedAt: new Date() } },
    { new: true }
  )
    .populate<{ service: { monthlyRate: number; billingDayOfMonth: number | null } }>(
      "service",
      "monthlyRate billingDayOfMonth"
    )
    .lean();
  if (!subscription) return fail("Abbonamento non trovato", 404);

  const monthlyRate = subscription.service?.monthlyRate ?? 0;
  const paidAt = data.paidAt ?? new Date();
  const amount =
    data.amount ??
    totalDue(monthlyRate, subscription.periodicity, subscription.donationSupplement);
  const donationAmount = data.donationAmount ?? subscription.donationSupplement ?? 0;
  const creditToUse = data.firstCycleCredit ?? 0;

  if (donationAmount > amount + 0.004) {
    return fail("La donazione è una parte dell'importo: non può superarlo.", 422);
  }
  // Un pagamento da zero attiverebbe l'abbonamento e sposterebbe la scadenza
  // senza che sia entrato nulla.
  if (amount + creditToUse <= 0) {
    return fail("Il pagamento deve avere un importo maggiore di zero.", 422);
  }

  // Un versamento che completa un ciclo già coperto in parte appartiene a
  // QUEL ciclo, non ne apre uno nuovo: va ancorato alla scadenza corrente.
  // Senza questo, chi salda il residuo in un mese diverso da quello del
  // primo versamento sposta la scadenza, il versamento precedente smette di
  // contare (paidForCycle confronta la fine del periodo con la scadenza) e
  // l'app richiede di nuovo soldi già incassati. Con il credito di
  // migrazione, che nasce alla decorrenza mentre il residuo si versa quando
  // capita, il caso è la norma e non l'eccezione.
  const esistenti = (
    await Payment.find({ subscription: id }, { amount: 1, paidAt: 1, periodStart: 1 }).lean()
  ).map((existing) => ({
    amount: existing.amount,
    paidAt: existing.paidAt ?? null,
    periodStart: existing.periodStart ?? null,
  }));
  const billingDay = subscription.service?.billingDayOfMonth;
  const inizioCicloCorrente = subscription.lastPaymentDate ?? subscription.startDate ?? null;
  const scadenzaCorrente = nextDueDate(
    subscription.lastPaymentDate,
    subscription.startDate,
    subscription.periodicity,
    billingDay
  );
  const giaIncassato = paidForCycle(
    esistenti,
    scadenzaCorrente,
    subscription.periodicity,
    billingDay
  );
  const dovutoCiclo = totalDue(
    monthlyRate,
    subscription.periodicity,
    subscription.donationSupplement
  );
  const completaCicloAperto =
    inizioCicloCorrente !== null && giaIncassato > 0 && giaIncassato < dovutoCiclo;

  // L'inizio del periodo è l'àncora del ciclo: paidForCycle ne ricava la
  // fine con la configurazione di adesso, quindi per un ciclo già aperto è
  // il suo inizio, non la data del versamento.
  const { periodStart, periodEnd } = coveredPeriod(
    completaCicloAperto && inizioCicloCorrente ? new Date(inizioCicloCorrente) : paidAt,
    subscription.periodicity,
    billingDay
  );

  if (creditToUse > 0) {
    // Il credito del primo mese si spende solo per quanto ne resta: lo
    // decide il server, il form lo propone soltanto.
    const available = await getFirstCycleCreditAvailable(id);
    if (creditToUse > available + 0.004) {
      return fail(
        `Il credito del primo mese disponibile è ${formatEUR(available)}: non se ne può usare di più.`,
        409
      );
    }
    // Il credito oltre il dovuto del ciclo andrebbe perso: risulterebbe
    // speso senza ridurre nulla.
    const residuo = Math.max(
      0,
      dovutoCiclo - paidForCycle(esistenti, periodEnd, subscription.periodicity, billingDay) - amount
    );
    if (creditToUse > residuo + 0.004) {
      return fail(
        `Su questo ciclo restano da coprire ${formatEUR(residuo)}: il credito non può superarli.`,
        422
      );
    }
  }

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

  // Stesso periodo dell'incasso: paidForCycle li somma sullo stesso ciclo,
  // e il ciclo si chiude con incasso + credito.
  if (creditToUse > 0) {
    await Payment.create({
      subscription: id,
      person: subscription.person,
      amount: creditToUse,
      donationAmount: 0,
      paidAt,
      method: "altro",
      kind: "credito_primo_mese",
      periodStart,
      periodEnd,
      notes: "Credito del primo mese non addebitato dal fornitore",
    });
  }

  // Avanza lastPaymentDate solo se il pagamento è più recente di quello registrato:
  // permette di inserire pagamenti arretrati senza falsare la prossima scadenza.
  // Chiudere un ciclo già aperto non sposta la scadenza: quel periodo era
  // già stato conteggiato, e farla avanzare regalerebbe un ciclo intero.
  const shouldAdvance =
    !completaCicloAperto &&
    (!subscription.lastPaymentDate || paidAt > new Date(subscription.lastPaymentDate));

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
}

export const GET = withAdmin(handleGET);
export const POST = withAdmin(handlePOST);
