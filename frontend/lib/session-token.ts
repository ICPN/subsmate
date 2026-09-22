import { SignJWT, jwtVerify } from "jose";

/**
 * Firma e verifica del token di sessione.
 * Contiene SOLO jose: il middleware gira in Edge runtime e importa da qui,
 * dove bcryptjs non deve finire.
 */

export const SESSION_COOKIE = "subsmate_session";
export const SESSION_DAYS = 7;

export interface SessionPayload {
  sub: string;
  iat: number;
  exp: number;
}

function secretKey(): Uint8Array {
  const value = process.env.AUTH_SECRET;
  if (!value) {
    throw new Error(
      "AUTH_SECRET non definita. Esegui: python execution/seed_admin.py --email <email> --name <nome>"
    );
  }
  return new TextEncoder().encode(value);
}

export async function signSessionToken(adminId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(adminId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey());
}

/** Restituisce null per token assente, manomesso, scaduto o malformato. */
export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  // Fuori dal try: AUTH_SECRET mancante è un errore di configurazione e deve
  // propagarsi, non essere confuso con un token invalido.
  const key = secretKey();
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string" || typeof payload.iat !== "number" || typeof payload.exp !== "number") {
      return null;
    }
    return { sub: payload.sub, iat: payload.iat, exp: payload.exp };
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  };
}
