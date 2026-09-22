import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session-token";

/**
 * Primo livello, in Edge runtime: verifica SOLO la firma del cookie.
 * Non è autorevole - non può interrogare MongoDB da Edge - ma evita che una
 * pagina protetta inizi a renderizzarsi. Il controllo vero è requireAdmin().
 */

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/auth/logout"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token && (await verifySessionToken(token))) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Autenticazione richiesta" }, { status: 401 });
  }

  const url = request.nextUrl.clone();
  const from = pathname + request.nextUrl.search;
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("from", from);
  return NextResponse.redirect(url);
}

export const config = {
  // Esclude anche gli asset statici in public/ (qualunque file con estensione),
  // così un logo o un font referenziato da /login non risulta rediretto.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
