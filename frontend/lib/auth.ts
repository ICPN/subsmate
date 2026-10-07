import bcrypt from "bcryptjs";
import { AdminUser } from "@/models/AdminUser";

/**
 * Password e blocco anti forza bruta. Solo Node runtime: bcryptjs non va
 * importato dal middleware (vedi lib/session-token.ts).
 *
 * Gli account si creano solo con execution/seed_admin.py; da qui passa invece
 * il cambio password dal profilo. Stesso costo dello script (12): gli hash
 * bcrypt dei due linguaggi sono compatibili (verificato nel Task 3).
 */

const BCRYPT_COST = 12;
export const MIN_PASSWORD_LENGTH = 12;
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

/** Messaggio di blocco, o null se l'account non è bloccato. */
export function lockedMessage(lockedUntil: Date | null | undefined): string | null {
  if (!lockedUntil || lockedUntil.getTime() <= Date.now()) return null;
  const minutes = Math.ceil((lockedUntil.getTime() - Date.now()) / 60000);
  return `Account bloccato per altri ${minutes} minuti dopo troppi tentativi falliti`;
}

/**
 * Conta una password sbagliata e blocca l'account al quinto tentativo. Lo
 * stesso contatore vale per il login e per la password attuale chiesta dal
 * profilo: altrimenti un cookie di sessione rubato basterebbe a indovinare la
 * password per tentativi e prendersi l'account.
 */
export async function registerFailedAttempt(adminId: unknown): Promise<void> {
  // Incremento atomico: con richieste concorrenti un read-modify-write
  // perderebbe conteggi, indebolendo proprio il blocco anti forza bruta.
  const updated = await AdminUser.findByIdAndUpdate(
    adminId,
    { $inc: { failedLoginAttempts: 1 } },
    { new: true }
  ).lean();

  if ((updated?.failedLoginAttempts ?? 0) >= MAX_ATTEMPTS) {
    await AdminUser.findByIdAndUpdate(adminId, {
      $set: { lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000), failedLoginAttempts: 0 },
    });
  }
}
