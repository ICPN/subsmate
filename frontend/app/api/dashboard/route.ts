import { getDashboardData } from "@/lib/queries";
import { ok, handleError } from "@/lib/api";
import { withAdmin } from "@/lib/requireAdmin";

/**
 * GET /api/dashboard — riepilogo per la home:
 * totale dovuto nel ciclo corrente, abbonamenti in ritardo / in scadenza,
 * totale donazioni raccolte.
 */
async function handleGET() {
  try {
    return ok(await getDashboardData());
  } catch (err) {
    return handleError(err);
  }
}

export const GET = withAdmin(handleGET);
