import { cookies } from "next/headers";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import { AdminUser } from "@/models/AdminUser";
import { verifyPassword } from "@/lib/auth";
import { SESSION_COOKIE, sessionCookieOptions, signSessionToken } from "@/lib/session-token";
import { ok, fail, parseBody, handleError } from "@/lib/api";

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

/**
 * Messaggio unico per email inesistente, password errata e account disattivato:
 * distinguerli trasformerebbe il form in uno strumento per scoprire le email registrate.
 */
const GENERIC_ERROR = "Email o password non corretti";

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
    if (!admin || admin.active !== true) return fail(GENERIC_ERROR, 401);

    if (admin.lockedUntil && admin.lockedUntil.getTime() > Date.now()) {
      const minutes = Math.ceil((admin.lockedUntil.getTime() - Date.now()) / 60000);
      return fail(
        `Account bloccato per altri ${minutes} minuti dopo troppi tentativi falliti`,
        423
      );
    }

    const passwordOk = await verifyPassword(data.password, admin.passwordHash);
    if (!passwordOk) {
      const attempts = (admin.failedLoginAttempts ?? 0) + 1;
      if (attempts >= MAX_ATTEMPTS) {
        admin.failedLoginAttempts = 0;
        admin.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60_000);
      } else {
        admin.failedLoginAttempts = attempts;
      }
      await admin.save();
      return fail(GENERIC_ERROR, 401);
    }

    admin.failedLoginAttempts = 0;
    admin.lockedUntil = null;
    admin.lastLoginAt = new Date();
    await admin.save();

    const token = await signSessionToken(String(admin._id));
    const store = await cookies();
    store.set(SESSION_COOKIE, token, sessionCookieOptions());

    return ok({ name: admin.name, email: admin.email });
  } catch (err) {
    return handleError(err);
  }
}
