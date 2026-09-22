import { connectToDatabase } from "@/lib/mongodb";
import { Subscription } from "@/models/Subscription";
import { subscriptionCreateSchema } from "@/lib/validation";
import { ok, handleError, parseBody } from "@/lib/api";
import { listSubscriptions } from "@/lib/queries";
import type { PaymentStatus } from "@/lib/billing";

/**
 * GET /api/subscriptions — elenco abbonamenti (persona × servizio) arricchito
 * con quota, totale dovuto, prossima scadenza e stato calcolati.
 * Filtri: ?status=in_ritardo&person=<id>&service=<id>
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") as PaymentStatus | null;
    const personId = searchParams.get("person");
    const serviceId = searchParams.get("service");

    const filter: Record<string, unknown> = {};
    if (personId) filter.person = personId;
    if (serviceId) filter.service = serviceId;

    let subscriptions = await listSubscriptions(filter);
    // Lo stato è derivato, quindi il filtro si applica dopo il calcolo.
    if (status) subscriptions = subscriptions.filter((s) => s.computed.status === status);

    return ok(subscriptions);
  } catch (err) {
    return handleError(err);
  }
}

/** POST /api/subscriptions — crea un abbonamento persona × servizio. */
export async function POST(request: Request) {
  try {
    await connectToDatabase();
    const { data, error } = await parseBody(request, subscriptionCreateSchema);
    if (error) return error;

    const subscription = await Subscription.create(data);
    return ok(subscription, 201);
  } catch (err) {
    return handleError(err);
  }
}
