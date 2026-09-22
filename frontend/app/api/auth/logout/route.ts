import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/session-token";
import { ok, handleError } from "@/lib/api";

/**
 * Non protetta da withAdmin: deve funzionare anche con una sessione gia' scaduta
 * o invalida, perche' il suo effetto - rimuovere il cookie - e' sicuro in ogni caso.
 */
export async function POST() {
  try {
    const store = await cookies();
    store.delete(SESSION_COOKIE);
    return ok({ loggedOut: true });
  } catch (err) {
    return handleError(err);
  }
}
