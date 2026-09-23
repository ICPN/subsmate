import { connectToDatabase } from "@/lib/mongodb";
import { Migration } from "@/models/Migration";
import { Subscription } from "@/models/Subscription";
import { Service } from "@/models/Service";
import { Payment } from "@/models/Payment";
import { computeSubscription, coveredPeriod } from "@/lib/billing";
import { migrationBalance } from "@/lib/migration";
import { getMigration } from "@/lib/queries";
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

    const [oldService, newService] = await Promise.all([
      Service.findById(oldSubscription.service).lean(),
      Service.findById(migration.toService).lean(),
    ]);
    if (!newService) return fail("Servizio di destinazione non trovato", 404);

    const oldPayments = await Payment.find(
      { subscription: oldSubscription._id },
      { amount: 1, periodEnd: 1 }
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
          periodEnd: payment.periodEnd ?? null,
        })),
      },
      now
    );

    const balance = migrationBalance({
      effectiveDate: new Date(migration.effectiveDate),
      closeOld: migration.closeOld,
      oldNextDueDate: oldComputed.nextDueDate,
      oldMonthlyRate: oldService?.monthlyRate ?? 0,
      oldPaidForCurrentCycle: oldComputed.paidForCurrentCycle,
      newMonthlyRate: newService.monthlyRate,
      newPeriodicity: oldSubscription.periodicity,
      donationSupplement: oldSubscription.donationSupplement,
    });

    // Rivendicazione atomica: da qui in poi si scrive, e due richieste
    // simultanee supererebbero entrambe il controllo di stato letto sopra.
    // La seconda trova la migrazione già "eseguita" e si ferma qui con un
    // messaggio leggibile, invece di morire sull'indice unico più avanti.
    const claimed = await Migration.findOneAndUpdate(
      { _id: id, status: "pianificata" },
      { $set: { status: "eseguita" } }
    ).lean();
    if (!claimed) {
      return fail("Questa migrazione è già stata eseguita o annullata.", 409);
    }

    try {
      return await esegui();
    } catch (err) {
      // Una scrittura fallita a metà lascerebbe la migrazione "eseguita" e
      // niente da mostrare: la si riapre, così l'admin può ritentare.
      await Migration.findByIdAndUpdate(id, { status: "pianificata", toSubscription: null });
      throw err;
    }

    async function esegui() {
      const newSubscription = existing
        ? await Subscription.findByIdAndUpdate(
            existing._id,
            {
              periodicity: oldSubscription!.periodicity,
              donationSupplement: oldSubscription!.donationSupplement,
              onboardingStatus: "attivo",
              startDate: migration!.effectiveDate,
              // Il ciclo riparte dalla decorrenza: i pagamenti storici di
              // quell'abbonamento appartengono a cicli chiusi e non contano.
              lastPaymentDate: null,
              notes: `Migrazione da ${oldService?.name ?? "servizio precedente"}`,
            },
            { new: true }
          )
        : await Subscription.create({
            person: migration!.person,
            service: migration!.toService,
            periodicity: oldSubscription!.periodicity,
            donationSupplement: oldSubscription!.donationSupplement,
            onboardingStatus: "attivo",
            startDate: migration!.effectiveDate,
            notes: `Migrazione da ${oldService?.name ?? "servizio precedente"}`,
          });
      if (!newSubscription) return fail("Abbonamento di destinazione non creato", 500);

    // Il credito chiude parte del primo ciclo: il periodo coperto si calcola
    // come per un versamento normale, altrimenti paidForCycle non lo
    // riconoscerebbe come appartenente al ciclo corrente.
    //
    // Non aggiorna lastPaymentDate del nuovo abbonamento: farlo sposterebbe
    // in avanti una scadenza che nessuno ha ancora pagato in denaro.
      if (balance.creditAmount > 0) {
        const { periodStart, periodEnd } = coveredPeriod(
          new Date(migration!.effectiveDate),
          oldSubscription!.periodicity,
          newService!.billingDayOfMonth
        );
        await Payment.create({
          subscription: newSubscription._id,
          person: migration!.person,
          amount: balance.creditAmount,
          donationAmount: 0,
          paidAt: migration!.effectiveDate,
          method: "altro",
          kind: "credito_migrazione",
          periodStart,
          periodEnd,
          notes: `Credito da ${oldService?.name ?? "servizio precedente"}: ${balance.creditMonths} mesi`,
        });
      }

      await Migration.findByIdAndUpdate(id, {
        toSubscription: newSubscription._id,
        creditMonths: balance.creditMonths,
        creditMonthlyRate: oldService?.monthlyRate ?? 0,
        // Il netto davvero riconosciuto, che il cap su quanto era stato
        // incassato può rendere inferiore a creditMonths × tariffa.
        creditAmount: balance.creditAmount,
      });

      if (migration!.closeOld === "alla_decorrenza") {
        await Subscription.findByIdAndUpdate(oldSubscription!._id, {
          onboardingStatus: "cessato",
        });
      }

      return ok({
        migration: await getMigration(id),
        subscription: String(newSubscription._id),
        balance,
      });
    }
  } catch (err) {
    return handleError(err);
  }
}

export const POST = withAdmin(handlePOST);
