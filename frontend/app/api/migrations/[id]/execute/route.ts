import { connectToDatabase, inTransaction } from "@/lib/mongodb";
import { Migration } from "@/models/Migration";
import { Subscription } from "@/models/Subscription";
import { Service } from "@/models/Service";
import { Payment } from "@/models/Payment";
import { PERIOD_MONTHS, addMonths, computeSubscription, coveredPeriod } from "@/lib/billing";
import { migrationBalance } from "@/lib/migration";
import { getFirstCycleCreditAvailable, getMigration } from "@/lib/queries";
import { ok, fail, handleError } from "@/lib/api";
import { withAdmin } from "@/lib/requireAdmin";

type Context = { params: Promise<{ id: string }> };

/**
 * POST /api/migrations/:id/execute — esegue il passaggio.
 *
 * Non c'è uno scheduler: il repo non ha job in background e Vercel Cron
 * sarebbe infrastruttura nuova per una funzione sola. L'app avvisa, l'admin
 * esegue, e il momento dell'esecuzione resta un fatto registrato.
 *
 * Il credito diventa un Payment con kind "credito_migrazione" sul nuovo
 * abbonamento: così `outstanding` scende da solo attraverso paidForCycle,
 * senza toccare il motore di calcolo. Non è un incasso, e gli aggregati di
 * denaro lo escludono.
 */
async function handlePOST(_request: Request, { params }: Context) {
  try {
    await connectToDatabase();
    const { id } = await params;

    // Una transazione sola: claim, credito, date e cessazione si scrivono
    // tutti o nessuno. Prima un errore a metà lasciava abbonamento e crediti
    // scritti con la migrazione riaperta, e il nuovo tentativo li duplicava.
    const result = await inTransaction(() => executeMigration(id));
    if (result instanceof Response) return result;

    return ok({
      migration: await getMigration(id),
      subscription: result.subscription,
      balance: result.balance,
    });
  } catch (err) {
    return handleError(err);
  }
}

async function executeMigration(id: string) {
  // Ogni rifiuto sta prima della prima scrittura: dopo, un `return fail`
  // confermerebbe la transazione a metà. Da lì in poi si lancia.
  const migration = await Migration.findById(id).lean();
  if (!migration) return fail("Migrazione non trovata", 404);
  if (migration.status !== "pianificata") {
    return fail("Questa migrazione è già stata eseguita o annullata.", 409);
  }

  const oldSubscription = await Subscription.findById(migration.fromSubscription).lean();
  if (!oldSubscription) return fail("Abbonamento di partenza non trovato", 404);

  // L'indice unico persona × servizio fallirebbe con un 11000 illeggibile:
  // meglio dirlo prima, con il nome del problema. Un abbonamento CESSATO su
  // quel servizio però non è un conflitto: è il caso normale di chi torna
  // indietro dopo una migrazione precedente, e l'indice unico lo rende
  // altrimenti irrisolvibile — nessuna interfaccia permetterebbe di uscirne.
  // In quel caso si riusa il documento invece di crearne un secondo.
  const existing = await Subscription.findOne({
    person: migration.person,
    service: migration.toService,
  }).lean();
  if (existing && existing.onboardingStatus !== "cessato") {
    return fail("Questa persona ha già un abbonamento attivo sul servizio di destinazione.", 409);
  }

  // In sequenza: una transazione non accetta operazioni parallele.
  const oldService = await Service.findById(oldSubscription.service).lean();
  const newService = await Service.findById(migration.toService).lean();
  if (!newService) return fail("Servizio di destinazione non trovato", 404);

  const oldPayments = await Payment.find(
    { subscription: oldSubscription._id },
    { amount: 1, paidAt: 1, periodStart: 1 }
  ).lean();

  const now = new Date();
  const oldComputed = computeSubscription(
    {
      monthlyRate: oldService?.monthlyRate ?? 0,
      periodicity: oldSubscription.periodicity,
      donationSupplement: oldSubscription.donationSupplement,
      onboardingStatus: oldSubscription.onboardingStatus,
      startDate: oldSubscription.startDate,
      lastPaymentDate: oldSubscription.lastPaymentDate,
      billingDayOfMonth: oldService?.billingDayOfMonth,
      payments: oldPayments.map((payment) => ({
        amount: payment.amount,
        paidAt: payment.paidAt ?? null,
        periodStart: payment.periodStart ?? null,
      })),
    },
    now
  );

  // La periodicità può cambiare con la migrazione: se non è stata scelta
  // resta quella in corso.
  const newPeriodicity = migration.toPeriodicity ?? oldSubscription.periodicity;

  // Il supplemento appartiene al servizio: chi donava continua a donare, ma
  // l'importo è quello della destinazione. Ereditare il vecchio faceva
  // risultare il trimestre nuovo più caro di quanto è.
  const newDonation =
    oldSubscription.donationSupplement > 0 ? (newService.donationSupplement ?? 0) : 0;

  // Il credito del primo mese passa sempre, qualunque sia closeOld: è
  // denaro versato e mai addebitato dal fornitore.
  const firstCycleCredit = await getFirstCycleCreditAvailable(oldSubscription._id);

  const balance = migrationBalance({
    effectiveDate: new Date(migration.effectiveDate),
    closeOld: migration.closeOld,
    oldNextDueDate: oldComputed.nextDueDate,
    oldMonthlyRate: oldService?.monthlyRate ?? 0,
    oldPeriodicity: oldSubscription.periodicity,
    oldPaidForCurrentCycle: oldComputed.paidForCurrentCycle,
    oldDonationSupplement: oldSubscription.donationSupplement,
    newMonthlyRate: newService.monthlyRate,
    newPeriodicity: newPeriodicity,
    newDonationSupplement: newDonation,
    firstCycleCredit,
  });

  // Rivendicazione con lo stato atteso nel filtro. Due esecuzioni simultanee
  // entrano in conflitto qui: la seconda riparte da capo, trova la migrazione
  // già eseguita e si ferma sopra con un messaggio leggibile.
  const claimed = await Migration.findOneAndUpdate(
    { _id: id, status: "pianificata" },
    { $set: { status: "eseguita" } }
  ).lean();
  if (!claimed) throw new Error("Migrazione cambiata durante l'esecuzione");

  // Anche il vecchio abbonamento si tocca subito: un pagamento che spende il
  // suo credito del primo mese in contemporanea entra in conflitto, invece di
  // spendere lo stesso credito che la migrazione sta trasferendo.
  await Subscription.updateOne({ _id: oldSubscription._id }, { $set: { updatedAt: new Date() } });

  const newSubscription = existing
    ? await Subscription.findByIdAndUpdate(
        existing._id,
        {
          periodicity: newPeriodicity,
          donationSupplement: newDonation,
          onboardingStatus: "attivo",
          startDate: migration.effectiveDate,
          // Il ciclo riparte dalla decorrenza: i pagamenti storici di
          // quell'abbonamento appartengono a cicli chiusi e non contano.
          lastPaymentDate: null,
          notes: `Migrazione da ${oldService?.name ?? "servizio precedente"}`,
        },
        { new: true }
      )
    : await Subscription.create({
        person: migration.person,
        service: migration.toService,
        periodicity: newPeriodicity,
        donationSupplement: newDonation,
        onboardingStatus: "attivo",
        startDate: migration.effectiveDate,
        notes: `Migrazione da ${oldService?.name ?? "servizio precedente"}`,
      });
  if (!newSubscription) throw new Error("Abbonamento di destinazione non creato");

  // Il credito si spende ciclo per ciclo, non tutto sul primo: cambiando
  // periodicità può valerne più di uno, e un solo versamento ancorato al
  // primo ciclo ne butterebbe via il resto (paidForCycle guarda un solo
  // ciclo, e outstanding non scende sotto zero). Un versamento per ciclo
  // coperto, più uno parziale per quel che avanza. Il periodo coperto si
  // calcola come per un versamento normale, altrimenti paidForCycle non lo
  // riconoscerebbe come appartenente al suo ciclo.
  let daSpendere = balance.creditAmount;
  let ciclo = 0;
  const mesiCiclo = PERIOD_MONTHS[newPeriodicity];
  while (daSpendere > 0.004) {
    const inizioCiclo = addMonths(new Date(migration.effectiveDate), ciclo * mesiCiclo);
    const { periodStart, periodEnd } = coveredPeriod(
      inizioCiclo,
      newPeriodicity,
      newService.billingDayOfMonth
    );
    const importo = Math.round(Math.min(daSpendere, balance.newTotal) * 100) / 100;
    await Payment.create({
      subscription: newSubscription._id,
      person: migration.person,
      amount: importo,
      donationAmount: 0,
      paidAt: migration.effectiveDate,
      method: "altro",
      kind: "credito_migrazione",
      periodStart,
      periodEnd,
      notes: `Credito da ${oldService?.name ?? "servizio precedente"}: ${balance.creditMonths} mesi${
        balance.firstCycleCredit > 0 ? " + credito del primo mese" : ""
      }`,
    });
    daSpendere = Math.round((daSpendere - importo) * 100) / 100;
    ciclo += 1;
  }

  // La scadenza va sull'ultimo ciclo toccato dal credito, anche se coperto
  // solo in parte: i cicli prima sono pagati, e quello diventa il ciclo
  // corrente con il residuo da versare, come dopo un versamento parziale in
  // denaro. Fermarsi all'ultimo ciclo intero lasciava il resto su un ciclo
  // che nessun calcolo guardava. Con un ciclo solo basta la data di inizio.
  if (ciclo > 1) {
    await Subscription.findByIdAndUpdate(newSubscription._id, {
      lastPaymentDate: addMonths(new Date(migration.effectiveDate), (ciclo - 1) * mesiCiclo),
    });
  }

  await Migration.findByIdAndUpdate(id, {
    toSubscription: newSubscription._id,
    creditMonths: balance.creditMonths,
    // Il valore di un mese come è stato riconosciuto, donazione
    // compresa: la sola tariffa del servizio non lo ricostruirebbe.
    creditMonthlyRate: balance.creditMonthlyRate,
    // Il netto davvero riconosciuto, che il cap su quanto era stato
    // incassato può rendere inferiore a creditMonths × tariffa.
    creditAmount: balance.creditAmount,
    // Segna il credito del primo mese come speso sul vecchio abbonamento.
    firstCycleCreditTransferred: balance.firstCycleCredit,
  });

  if (migration.closeOld === "alla_decorrenza") {
    await Subscription.findByIdAndUpdate(oldSubscription._id, {
      onboardingStatus: "cessato",
    });
  }

  return { subscription: String(newSubscription._id), balance };
}

export const POST = withAdmin(handlePOST);
