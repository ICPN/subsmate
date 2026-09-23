import { connectToDatabase } from "@/lib/mongodb";
import { Migration } from "@/models/Migration";
import { Subscription } from "@/models/Subscription";
import { migrationUpdateSchema } from "@/lib/validation";
import { getMigration } from "@/lib/queries";
import { ok, fail, handleError, parseBody } from "@/lib/api";
import { withAdmin } from "@/lib/requireAdmin";

type Context = { params: Promise<{ id: string }> };

/**
 * PATCH /api/migrations/:id — corregge una migrazione ancora pianificata.
 * Una già eseguita non si modifica: ha creato un abbonamento e scritto un
 * credito, quindi cambiarne i termini falsificherebbe fatti già accaduti.
 */
async function handlePATCH(request: Request, { params }: Context) {
  try {
    await connectToDatabase();
    const { id } = await params;

    const { data, error } = await parseBody(request, migrationUpdateSchema);
    if (error) return error;

    const migration = await Migration.findById(id).lean();
    if (!migration) return fail("Migrazione non trovata", 404);
    if (migration.status !== "pianificata") {
      return fail("Solo una migrazione pianificata si può modificare.", 409);
    }

    if (data.toService) {
      const subscription = await Subscription.findById(migration.fromSubscription).lean();
      if (subscription && String(subscription.service) === data.toService) {
        return fail("Il servizio di destinazione coincide con quello attuale.", 422);
      }
    }

    const changes: Record<string, unknown> = {};
    if (data.toService !== undefined) changes.toService = data.toService;
    if (data.effectiveDate !== undefined) changes.effectiveDate = data.effectiveDate;
    if (data.closeOld !== undefined) changes.closeOld = data.closeOld;
    if (data.notes !== undefined) changes.notes = data.notes;

    await Migration.findByIdAndUpdate(id, changes, { runValidators: true });
    return ok(await getMigration(id));
  } catch (err) {
    return handleError(err);
  }
}

/**
 * DELETE /api/migrations/:id — annulla il piano. Non cancella il documento:
 * lo stato "annullata" resta nella storia dell'abbonamento, e l'indice unico
 * parziale lo ignora, quindi se ne può pianificare subito un'altra.
 */
async function handleDELETE(_request: Request, { params }: Context) {
  try {
    await connectToDatabase();
    const { id } = await params;

    const migration = await Migration.findById(id).lean();
    if (!migration) return fail("Migrazione non trovata", 404);
    if (migration.status === "eseguita") {
      return fail("Una migrazione eseguita non si annulla.", 409);
    }

    await Migration.findByIdAndUpdate(id, { status: "annullata" });
    return ok({ annullata: true });
  } catch (err) {
    return handleError(err);
  }
}

export const PATCH = withAdmin(handlePATCH);
export const DELETE = withAdmin(handleDELETE);
