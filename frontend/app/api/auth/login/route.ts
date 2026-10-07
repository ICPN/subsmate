import { cookies } from "next/headers";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import { AdminUser } from "@/models/AdminUser";
import {
  DUMMY_HASH,
  LOCK_MINUTES,
  MAX_ATTEMPTS,
  claimAttempt,
  clearAttempts,
  registerFailedAttempt,
  verifyPassword,
} from "@/lib/auth";
import { SESSION_COOKIE, sessionCookieOptions, signSessionToken } from "@/lib/session-token";
import { ok, fail, parseBody, handleError } from "@/lib/api";

/**
 * Messaggio e stato unici per email inesistente, password errata, account
 * disattivato o bloccato: distinguerli trasformerebbe il form in uno strumento
 * per scoprire le email registrate. Il blocco quindi si annuncia qui, per tutti.
 */
const GENERIC_ERROR = `Email o password non corretti. Dopo ${MAX_ATTEMPTS} tentativi sbagliati l'accesso si blocca per ${LOCK_MINUTES} minuti.`;

const loginSchema = z.object({
  email: z.string().email("Email non valida"),
  password: z.string().min(1, "Password obbligatoria"),
});

export async function POST(request: Request) {
  try {
    await connectToDatabase();
    const { data, error } = await parseBody(request, loginSchema);
    if (error) return error;

    const admin = await AdminUser.findOne({ email: data.email.toLowerCase() }).select("+passwordHash");
    const usable = admin !== null && admin.active === true && (await claimAttempt(admin._id));

    // bcrypt gira sempre, anche senza un account utilizzabile: una risposta
    // più rapida direbbe quali email esistono.
    const passwordOk = await verifyPassword(
      data.password,
      usable && admin ? admin.passwordHash : DUMMY_HASH
    );
    if (!usable || !admin) return fail(GENERIC_ERROR, 401);
    if (!passwordOk) {
      await registerFailedAttempt(admin._id);
      return fail(GENERIC_ERROR, 401);
    }
    if (!(await clearAttempts(admin._id))) return fail(GENERIC_ERROR, 401);

    await AdminUser.updateOne({ _id: admin._id }, { $set: { lastLoginAt: new Date() } });

    const token = await signSessionToken(String(admin._id));
    const store = await cookies();
    store.set(SESSION_COOKIE, token, sessionCookieOptions());

    return ok({ name: admin.name, email: admin.email });
  } catch (err) {
    return handleError(err);
  }
}
