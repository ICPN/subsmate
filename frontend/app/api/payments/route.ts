import { connectToDatabase } from "@/lib/mongodb";
import { Payment } from "@/models/Payment";
import { Person } from "@/models/Person";
import { ok, handleError } from "@/lib/api";

/**
 * GET /api/payments — storico pagamenti globale.
 * Filtri: ?person=<id>&from=<ISO>&to=<ISO>&limit=<n>
 */
export async function GET(request: Request) {
  try {
    await connectToDatabase();
    void Person;

    const { searchParams } = new URL(request.url);
    const personId = searchParams.get("person");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const limit = Math.min(Number(searchParams.get("limit") ?? 100), 500);

    const filter: Record<string, unknown> = {};
    if (personId) filter.person = personId;
    if (from || to) {
      filter.paidAt = {
        ...(from ? { $gte: new Date(from) } : {}),
        ...(to ? { $lte: new Date(to) } : {}),
      };
    }

    const payments = await Payment.find(filter)
      .populate("person", "firstName lastName email")
      .sort({ paidAt: -1 })
      .limit(limit)
      .lean();

    return ok(payments);
  } catch (err) {
    return handleError(err);
  }
}
