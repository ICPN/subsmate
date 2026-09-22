import { getDashboardData } from "@/lib/queries";
import { ok, handleError } from "@/lib/api";

/**
 * GET /api/dashboard — riepilogo per la home:
 * totale dovuto nel ciclo corrente, abbonamenti in ritardo / in scadenza,
 * totale donazioni raccolte.
 */
export async function GET() {
  try {
    return ok(await getDashboardData());
  } catch (err) {
    return handleError(err);
  }
}
