import { connectToDatabase } from "@/lib/mongodb";
import { Subscription } from "@/models/Subscription";
import { Payment } from "@/models/Payment";
import { Person } from "@/models/Person";
import { Service } from "@/models/Service";
import { subscriptionUpdateSchema } from "@/lib/validation";
import { ok, fail, handleError, parseBody } from "@/lib/api";
import { computeSubscription } from "@/lib/billing";
import { withAdmin } from "@/lib/requireAdmin";

type Context = { params: Promise<{ id: string }> };

/** GET /api/subscriptions/:id — dettaglio con calcoli e storico pagamenti. */
async function handleGET(_request: Request, { params }: Context) {
  try {
    await connectToDatabase();
    void Person;
    void Service;
    const { id } = await params;

    const subscription = await Subscription.findById(id)
      .populate("person", "firstName lastName email")
      .populate("service", "name slug monthlyRate billingDayOfMonth")
      .lean();
    if (!subscription) return fail("Abbonamento non trovato", 404);

    const service = subscription.service as unknown as {
      monthlyRate?: number;
      billingDayOfMonth?: number | null;
    } | null;
    // Lo storico serve anche al calcolo: un ciclo pagato solo in parte non è chiuso.
    const payments = await Payment.find({ subscription: id }).sort({ paidAt: -1 }).lean();

    const computed = computeSubscription({
      monthlyRate: service?.monthlyRate ?? 0,
      periodicity: subscription.periodicity,
      donationSupplement: subscription.donationSupplement,
      onboardingStatus: subscription.onboardingStatus,
      startDate: subscription.startDate,
      lastPaymentDate: subscription.lastPaymentDate,
      billingDayOfMonth: service?.billingDayOfMonth,
      payments,
    });

    return ok({ ...subscription, computed, payments });
  } catch (err) {
    return handleError(err);
  }
}

async function handlePATCH(request: Request, { params }: Context) {
  try {
    await connectToDatabase();
    const { id } = await params;
    const { data, error } = await parseBody(request, subscriptionUpdateSchema);
    if (error) return error;

    const subscription = await Subscription.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    }).lean();
    if (!subscription) return fail("Abbonamento non trovato", 404);
    return ok(subscription);
  } catch (err) {
    return handleError(err);
  }
}

/** Elimina l'abbonamento e il suo storico pagamenti. */
async function handleDELETE(_request: Request, { params }: Context) {
  try {
    await connectToDatabase();
    const { id } = await params;

    const subscription = await Subscription.findByIdAndDelete(id).lean();
    if (!subscription) return fail("Abbonamento non trovato", 404);

    const { deletedCount } = await Payment.deleteMany({ subscription: id });
    return ok({ deleted: true, paymentsDeleted: deletedCount });
  } catch (err) {
    return handleError(err);
  }
}

export const GET = withAdmin(handleGET);
export const PATCH = withAdmin(handlePATCH);
export const DELETE = withAdmin(handleDELETE);
