import { connectToDatabase } from "@/lib/mongodb";
import { Subscription } from "@/models/Subscription";
import { Migration } from "@/models/Migration";
import { migrationCreateSchema } from "@/lib/validation";
import { getMigration } from "@/lib/queries";
import { ok, fail, handleError, parseBody } from "@/lib/api";
import { withAdmin } from "@/lib/requireAdmin";

type Context = { params: Promise<{ id: string }> };

/**
 * POST /api/subscriptions/:id/migration — pianifica il passaggio a un altro
 * servizio. Non esegue nulla: crea il piano, che l'admin eseguirà a mano
 * quando l'avviso lo segnala. Il saldo non si salva, si ricalcola in lettura.
 */
async function handlePOST(request: Request, { params }: Context) {
  try {
    await connectToDatabase();
    const { id } = await params;

    const { data, error } = await parseBody(request, migrationCreateSchema);
    if (error) return error;

    const subscription = await Subscription.findById(id).lean();
    if (!subscription) return fail("Abbonamento non trovato", 404);
    if (subscription.onboardingStatus === "cessato") {
      return fail("Un abbonamento cessato non si migra: creane uno nuovo.", 409);
    }
    if (String(subscription.service) === data.toService) {
      return fail("Il servizio di destinazione coincide con quello attuale.", 422);
    }

    const pending = await Migration.findOne({
      fromSubscription: id,
      status: "pianificata",
    }).lean();
    if (pending) {
      return fail("Esiste già una migrazione pianificata per questo abbonamento.", 409);
    }

    const created = await Migration.create({
      person: subscription.person,
      fromSubscription: id,
      toService: data.toService,
      effectiveDate: data.effectiveDate,
      closeOld: data.closeOld ?? "alla_decorrenza",
      // Solo se diversa da quella in corso: un valore uguale sarebbe una
      // scelta congelata dove non ce n'è stata nessuna.
      toPeriodicity:
        data.toPeriodicity && data.toPeriodicity !== subscription.periodicity
          ? data.toPeriodicity
          : null,
      notes: data.notes ?? "",
    });

    return ok(await getMigration(String(created._id)), 201);
  } catch (err) {
    return handleError(err);
  }
}

export const POST = withAdmin(handlePOST);
