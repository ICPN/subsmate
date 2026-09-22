import bcrypt from "bcryptjs";

/**
 * Verifica delle password. Solo Node runtime: bcryptjs non va importato dal
 * middleware (vedi lib/session-token.ts).
 *
 * Non c'è una hashPassword() qui: le password si impostano soltanto con
 * execution/seed_admin.py, che genera l'hash in Python. Gli hash bcrypt dei due
 * linguaggi sono compatibili (verificato nel Task 3).
 */

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
