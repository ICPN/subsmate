import { connectToDatabase } from "@/lib/mongodb";
import { Service } from "@/models/Service";
import { Subscription } from "@/models/Subscription";
import { serviceUpdateSchema } from "@/lib/validation";
import { ok, fail, handleError, parseBody } from "@/lib/api";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    await connectToDatabase();
    const { id } = await params;
    const service = await Service.findById(id).lean();
    if (!service) return fail("Servizio non trovato", 404);
    return ok(service);
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    await connectToDatabase();
    const { id } = await params;
    const { data, error } = await parseBody(request, serviceUpdateSchema);
    if (error) return error;

    const service = await Service.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    }).lean();
    if (!service) return fail("Servizio non trovato", 404);
    return ok(service);
  } catch (err) {
    return handleError(err);
  }
}

/** Il servizio si elimina solo se nessun abbonamento lo referenzia. */
export async function DELETE(_request: Request, { params }: Context) {
  try {
    await connectToDatabase();
    const { id } = await params;

    const inUse = await Subscription.countDocuments({ service: id });
    if (inUse > 0) {
      return fail(
        `Impossibile eliminare: ${inUse} abbonamenti usano questo servizio. Disattivalo invece.`,
        409
      );
    }

    const service = await Service.findByIdAndDelete(id).lean();
    if (!service) return fail("Servizio non trovato", 404);
    return ok({ deleted: true });
  } catch (err) {
    return handleError(err);
  }
}
