import { cookies } from "next/headers";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import { AdminUser } from "@/models/AdminUser";
import {
  MIN_PASSWORD_LENGTH,
  hashPassword,
  lockedMessage,
  registerFailedAttempt,
  verifyPassword,
} from "@/lib/auth";
import { getCurrentAdmin, withAdmin } from "@/lib/requireAdmin";
import { SESSION_COOKIE, sessionCookieOptions, signSessionToken } from "@/lib/session-token";
import { ok, fail, parseBody } from "@/lib/api";

const accountSchema = z.object({
  currentPassword: z.string().min(1),
  email: z.string().email().optional(),
  newPassword: z.string().optional(),
});

/**
 * PATCH /api/account — l'admin collegato cambia la propria email o password.
 *
 * Agisce solo sull'admin della sessione: l'id viene da getCurrentAdmin(), mai
 * dal corpo, così nessuno può modificare un altro account da qui. Non è un
 * reset: serve la password attuale, e gli account si creano ancora solo con
 * execution/seed_admin.py.
 */
async function handlePATCH(request: Request) {
  const current = await getCurrentAdmin();
  if (!current) return fail("Autenticazione richiesta", 401);

  const { data, error } = await parseBody(request, accountSchema);
  if (error) return error;
  if (!data.email && !data.newPassword) return fail("Niente da modificare", 400);
  if (data.newPassword !== undefined && data.newPassword.length < MIN_PASSWORD_LENGTH) {
    return fail(`La nuova password deve avere almeno ${MIN_PASSWORD_LENGTH} caratteri`, 422);
  }

  await connectToDatabase();
  const admin = await AdminUser.findById(current.id).select("+passwordHash");
  if (!admin) return fail("Autenticazione richiesta", 401);

  // La password attuale protegge da chi trova una sessione aperta: senza,
  // basterebbe un cookie per cambiare email e password e prendersi l'account.
  // Gli errori contano nel blocco del login.
  const locked = lockedMessage(admin.lockedUntil);
  if (locked) return fail(locked, 423);
  if (!(await verifyPassword(data.currentPassword, admin.passwordHash))) {
    await registerFailedAttempt(admin._id);
    return fail("Password attuale non corretta", 401);
  }

  if (data.email) {
    const email = data.email.toLowerCase();
    if (email !== admin.email) {
      const taken = await AdminUser.exists({ email, _id: { $ne: admin._id } });
      if (taken) return fail("Email già usata da un altro account", 409);
      admin.email = email;
    }
  }

  if (data.newPassword) {
    admin.passwordHash = await hashPassword(data.newPassword);
    // Chiude tutte le sessioni emesse prima: requireAdmin confronta questa
    // data con l'iat del token.
    admin.passwordChangedAt = new Date();
  }
  admin.failedLoginAttempts = 0;
  await admin.save();

  // Un token nuovo per la sessione corrente, firmato dopo passwordChangedAt:
  // chi cambia la password resta collegato, le altre sessioni no.
  if (data.newPassword) {
    const store = await cookies();
    store.set(SESSION_COOKIE, await signSessionToken(String(admin._id)), sessionCookieOptions());
  }

  return ok({ email: admin.email, passwordChanged: Boolean(data.newPassword) });
}

export const PATCH = withAdmin(handlePATCH);
