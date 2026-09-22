import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connectToDatabase } from "@/lib/mongodb";
import { AdminUser } from "@/models/AdminUser";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session-token";
import { fail, handleError } from "@/lib/api";

/**
 * Controllo autorevole della sessione. Gira in Node runtime perché interroga
 * MongoDB: il middleware in Edge non può farlo e verifica solo la firma.
 */

export interface CurrentAdmin {
  id: string;
  name: string;
  email: string;
  role: string;
}

export async function getCurrentAdmin(): Promise<CurrentAdmin | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const payload = await verifySessionToken(token);
  if (!payload) return null;

  await connectToDatabase();
  const admin = await AdminUser.findById(payload.sub).lean();
  if (!admin || admin.active !== true) return null;

  // Un cambio password invalida i token emessi prima del cambio.
  if (admin.passwordChangedAt) {
    const changedAt = Math.floor(new Date(admin.passwordChangedAt).getTime() / 1000);
    if (changedAt > payload.iat) return null;
  }

  return {
    id: String(admin._id),
    name: admin.name,
    email: admin.email,
    role: admin.role ?? "admin",
  };
}

/** Per le pagine: redirige a /login conservando il percorso di partenza. */
export async function requireAdmin(fromPath?: string): Promise<CurrentAdmin> {
  const admin = await getCurrentAdmin();
  if (!admin) {
    redirect(fromPath ? `/login?from=${encodeURIComponent(fromPath)}` : "/login");
  }
  return admin;
}

/**
 * Per le route API. Si usa come wrapper invece di una chiamata libera: così una
 * route non protetta si nota nel diff, invece di restare aperta per dimenticanza.
 *
 * Generico su `Ctx` (invece di una tupla `...args`) perché Next.js 16 tipizza
 * il secondo parametro dei route handler con parametri dinamici come oggetto
 * `{ params: Promise<...> }`, non come elemento di una tupla arbitraria: così
 * il tipo restituito resta compatibile sia con `GET(request)` sia con
 * `GET(request, { params })`, che Next verifica staticamente.
 */
export function withAdmin<Ctx = unknown>(
  handler: (request: Request, context: Ctx) => Promise<Response>
) {
  return async (request: Request, context: Ctx): Promise<Response> => {
    try {
      const admin = await getCurrentAdmin();
      if (!admin) return fail("Autenticazione richiesta", 401);
      return await handler(request, context);
    } catch (err) {
      return handleError(err);
    }
  };
}
