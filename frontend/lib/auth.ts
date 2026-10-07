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
export const MAX_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;

/**
 * Hash bcrypt di una stringa qualsiasi, con lo stesso costo di quelli veri:
 * il login lo confronta quando l'account non esiste o non è utilizzabile,
 * così il tempo di risposta non dice quali email sono registrate.
 */
export const DUMMY_HASH = "$2b$12$m9CeK9EwYqinEba9TVTs7e.xUJWpEE8o5tM7y5W9YhbLNTyZXMEI6";

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
 * Blocco anti forza bruta, in tre passi atomici. Lo stesso contatore vale per
 * il login e per la password attuale chiesta dal profilo: altrimenti un
 * cookie di sessione rubato basterebbe a indovinare la password per tentativi.
 *
 * 1. `claimAttempt` conta il tentativo PRIMA di bcrypt, nello stesso update
 *    che controlla blocco e limite: tentativi paralleli non possono superare
 *    il limite leggendo tutti un contatore ancora basso.
 * 2. `registerFailedAttempt` blocca l'account se quel tentativo era l'ultimo.
 * 3. `clearAttempts` azzera il contatore a password giusta, ma solo se nel
 *    frattempo nessun tentativo parallelo ha bloccato l'account.
 */
export async function claimAttempt(adminId: unknown): Promise<boolean> {
  const result = await AdminUser.updateOne(
    {
      _id: adminId,
      // $not invece di $lt/$lte: copre anche i documenti senza il campo.
      failedLoginAttempts: { $not: { $gte: MAX_ATTEMPTS } },
      lockedUntil: { $not: { $gt: new Date() } },
    },
    { $inc: { failedLoginAttempts: 1 } }
  );
  return result.modifiedCount === 1;
}

export async function registerFailedAttempt(adminId: unknown): Promise<void> {
  await AdminUser.updateOne(
    { _id: adminId, failedLoginAttempts: { $gte: MAX_ATTEMPTS } },
    {
      $set: { lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000), failedLoginAttempts: 0 },
    }
  );
}

export async function clearAttempts(adminId: unknown): Promise<boolean> {
  const result = await AdminUser.updateOne(
    { _id: adminId, lockedUntil: { $not: { $gt: new Date() } } },
    { $set: { failedLoginAttempts: 0, lockedUntil: null } }
  );
  return result.matchedCount === 1;
}
