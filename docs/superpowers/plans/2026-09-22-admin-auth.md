# Autenticazione admin — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Proteggere SubsMate con login email + password, sessione di 7 giorni e revoca immediata alla disattivazione dell'admin.

**Architecture:** Cookie `httpOnly` con JWT firmato HS256. Il middleware gira in Edge e verifica solo la firma del cookie (redirect o 401); il controllo autorevole su database — l'admin esiste, è attivo, la password non è cambiata dopo l'emissione del token — avviene in Node runtime tramite `requireAdmin()` nel layout protetto e `withAdmin()` su ogni route API. Gli account si creano solo con uno script Python.

**Tech Stack:** Next.js 16 (App Router), Mongoose, `jose` (JWT, Edge-compatibile), `bcryptjs` (Node), `bcrypt` (Python), Zod.

**Spec:** `docs/superpowers/specs/2026-09-22-admin-auth-design.md`

## Global Constraints

- **Nessun framework di test.** Il repo non ne ha e non se ne introduce uno. Ogni task si chiude con una verifica eseguibile concreta (comando `node`, `curl`, o browser), non con uno unit test. Non installare Vitest, Jest o Playwright.
- **MongoDB locale:** `mongodb://127.0.0.1:27017`, database `subsmate`. Atlas non è raggiungibile: la porta 27017 è bloccata in uscita su questa rete.
- **Lingua:** interfaccia, commenti e messaggi d'errore in italiano, con accenti corretti. Identificatori di codice in inglese.
- **Durata sessione:** 7 giorni. **Blocco account:** 15 minuti dopo 5 tentativi falliti. **Bcrypt cost:** 12. **Cookie:** `subsmate_session`, `httpOnly`, `sameSite=lax`, `path=/`, `secure` solo in produzione.
- **Messaggio di login fallito:** sempre `Email o password non corretti`, identico per email inesistente, password errata e account disattivato.
- **Comandi dal repo:** i comandi `npm` si lanciano da `frontend/`, gli script Python dalla root.
- **Identità git:** il repo usa `yintong-zhou <zhouyintong96@gmail.com>` come identità locale; non usare `--global`.

## Deviazione dalla spec (intenzionale)

La spec colloca hash password e firma JWT entrambi in `frontend/lib/auth.ts`. Il piano li separa in due file:

- `frontend/lib/session-token.ts` — solo `jose`, **importabile da Edge**
- `frontend/lib/auth.ts` — solo `bcryptjs`, Node

Motivo: `middleware.ts` gira in Edge runtime. Se importasse un modulo che contiene anche `bcryptjs`, quella libreria finirebbe nel bundle Edge. La separazione mantiene il middleware leggero e rende impossibile importare bcrypt per sbaglio in Edge. Nessun altro aspetto della spec cambia.

---

### Task 1: Dipendenze, campi del modello, AUTH_SECRET

**Files:**
- Modify: `frontend/package.json` (via npm)
- Modify: `frontend/models/AdminUser.ts`
- Modify: `execution/requirements.txt`
- Modify: `.env.example`

**Interfaces:**
- Consumes: niente (primo task)
- Produces: campi `passwordChangedAt: Date | null`, `failedLoginAttempts: number`, `lockedUntil: Date | null` su `AdminUserDoc`; variabile d'ambiente `AUTH_SECRET`

- [ ] **Step 1: Installare le dipendenze Node**

```bash
cd frontend && npm install jose bcryptjs && npm install -D @types/bcryptjs
```

- [ ] **Step 2: Aggiungere bcrypt alle dipendenze Python**

In `execution/requirements.txt`, aggiungere in fondo:

```
bcrypt>=4.1
```

Poi installare:

```bash
pip install -r execution/requirements.txt
```

- [ ] **Step 3: Aggiungere i tre campi al modello**

In `frontend/models/AdminUser.ts`, dentro lo schema, subito dopo la riga `lastLoginAt`:

```ts
    lastLoginAt: { type: Date, default: null },
    // Confrontato con l'iat del token: cambiare password invalida le sessioni aperte.
    passwordChangedAt: { type: Date, default: null },
    // Protezione forza bruta: 5 fallimenti bloccano l'account per 15 minuti.
    failedLoginAttempts: { type: Number, default: 0, min: 0 },
    lockedUntil: { type: Date, default: null },
```

- [ ] **Step 4: Documentare AUTH_SECRET in `.env.example`**

In `.env.example`, dopo il blocco `# --- App ---`, aggiungere:

```
# --- Autenticazione ---
# Segreto per la firma dei cookie di sessione (32 byte casuali, base64url).
# Generato automaticamente da execution/seed_admin.py se assente in frontend/.env.local.
AUTH_SECRET=""
```

- [ ] **Step 5: Verificare che tutto compili e le librerie carichino**

```bash
cd frontend && npx tsc --noEmit && node -e "import('jose').then(m=>console.log('jose ok:', typeof m.SignJWT)); const b=require('bcryptjs'); console.log('bcryptjs ok:', typeof b.hash)"
```

Atteso: nessun errore TypeScript, poi `bcryptjs ok: function` e `jose ok: function`.

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/models/AdminUser.ts execution/requirements.txt .env.example
git commit -m "feat(auth): dipendenze e campi del modello AdminUser"
```

---

### Task 2: Primitive di sessione e password

**Files:**
- Create: `frontend/lib/session-token.ts`
- Create: `frontend/lib/auth.ts`

**Interfaces:**
- Consumes: `AUTH_SECRET` dal Task 1
- Produces:
  - `SESSION_COOKIE: string` (`"subsmate_session"`)
  - `signSessionToken(adminId: string): Promise<string>`
  - `verifySessionToken(token: string): Promise<SessionPayload | null>` dove `SessionPayload = { sub: string; iat: number; exp: number }`
  - `sessionCookieOptions(): { httpOnly: boolean; sameSite: "lax"; secure: boolean; path: string; maxAge: number }`
  - `verifyPassword(plain: string, hash: string): Promise<boolean>`

Nota: lato Node serve **solo** la verifica. L'hashing avviene esclusivamente nello script di seed in Python (Task 3), perché è l'unico punto in cui si impostano le password. Una `hashPassword()` in TypeScript resterebbe codice morto.

- [ ] **Step 1: Creare `frontend/lib/session-token.ts`**

Solo `jose`: questo file deve restare importabile dal middleware in Edge runtime.

```ts
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
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
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
```

- [ ] **Step 2: Creare `frontend/lib/auth.ts`**

```ts
import bcrypt from "bcryptjs";

/**
 * Verifica delle password. Solo Node runtime: bcryptjs non va importato dal
 * middleware (vedi lib/session-token.ts).
 *
 * Non c'e' una hashPassword() qui: le password si impostano soltanto con
 * execution/seed_admin.py, che genera l'hash in Python. Gli hash bcrypt dei due
 * linguaggi sono compatibili (verificato nel Task 3).
 */

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
```

- [ ] **Step 3: Scrivere lo script di verifica**

Crea `.tmp/verify-auth.mjs` (cartella già ignorata da git):

```js
import { SignJWT, jwtVerify } from "../frontend/node_modules/jose/dist/webapi/index.js";
import bcrypt from "../frontend/node_modules/bcryptjs/index.js";

const secret = new TextEncoder().encode("segreto-di-prova-lungo-abbastanza-32b");

// 1. Password: hash e confronto
const hash = await bcrypt.hash("password-corretta", 12);
console.log("hash valido:", hash.startsWith("$2"));
console.log("password giusta accettata:", await bcrypt.compare("password-corretta", hash));
console.log("password sbagliata rifiutata:", !(await bcrypt.compare("password-errata", hash)));

// 2. Token valido
const token = await new SignJWT({})
  .setProtectedHeader({ alg: "HS256" })
  .setSubject("507f1f77bcf86cd799439011")
  .setIssuedAt()
  .setExpirationTime("7d")
  .sign(secret);
const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
console.log("token verificato, sub corretto:", payload.sub === "507f1f77bcf86cd799439011");

// 3. Token manomesso rifiutato
try {
  await jwtVerify(token.slice(0, -3) + "AAA", secret, { algorithms: ["HS256"] });
  console.log("token manomesso rifiutato: false");
} catch {
  console.log("token manomesso rifiutato: true");
}

// 4. Token scaduto rifiutato
const expired = await new SignJWT({})
  .setProtectedHeader({ alg: "HS256" })
  .setSubject("x")
  .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
  .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
  .sign(secret);
try {
  await jwtVerify(expired, secret, { algorithms: ["HS256"] });
  console.log("token scaduto rifiutato: false");
} catch {
  console.log("token scaduto rifiutato: true");
}
```

- [ ] **Step 4: Eseguire la verifica**

```bash
node .tmp/verify-auth.mjs
```

Atteso: sei righe, tutte con valore `true`. Se una è `false`, la primitiva corrispondente è rotta: correggere prima di proseguire.

- [ ] **Step 5: Commit**

Lo script di verifica sta in `.tmp/`, che è ignorata: non va committato.

```bash
git add frontend/lib/session-token.ts frontend/lib/auth.ts
git commit -m "feat(auth): firma token di sessione e hash password"
```

---

### Task 3: Script di seed dell'admin

**Files:**
- Create: `execution/seed_admin.py`

**Interfaces:**
- Consumes: `hashPassword` non serve qui — lo script genera l'hash bcrypt in Python, compatibile con `bcryptjs`
- Produces: collection `adminusers` con un documento; `AUTH_SECRET` in `frontend/.env.local`

- [ ] **Step 1: Creare `execution/seed_admin.py`**

```python
"""Crea o aggiorna un admin di SubsMate.

La password non si passa come argomento: finirebbe nella cronologia della shell.
Lo script la chiede in input nascosto e la conferma.

Uso:
    python execution/seed_admin.py --email "tizio@icpn.it" --name "Nome Cognome"
    python execution/seed_admin.py --email "tizio@icpn.it" --reset-password

Vedi docs/superpowers/specs/2026-09-22-admin-auth-design.md
"""

import argparse
import base64
import getpass
import secrets
import sys
from datetime import datetime, timezone
from pathlib import Path

import bcrypt

from db import get_db, ROOT

BCRYPT_COST = 12
MIN_PASSWORD_LENGTH = 12
ENV_LOCAL = ROOT / "frontend" / ".env.local"


def ensure_auth_secret() -> None:
    """Genera AUTH_SECRET in frontend/.env.local se assente, senza toccare le altre righe."""
    if ENV_LOCAL.exists():
        content = ENV_LOCAL.read_text(encoding="utf-8")
        for line in content.splitlines():
            stripped = line.strip()
            if stripped.startswith("AUTH_SECRET=") and stripped not in ('AUTH_SECRET=""', "AUTH_SECRET="):
                print("AUTH_SECRET gia' presente, lasciata invariata.")
                return
    else:
        content = ""

    value = base64.urlsafe_b64encode(secrets.token_bytes(32)).decode().rstrip("=")
    separator = "" if content.endswith("\n") or not content else "\n"
    with ENV_LOCAL.open("a", encoding="utf-8") as handle:
        handle.write(f'{separator}\n# Generata da execution/seed_admin.py\nAUTH_SECRET="{value}"\n')
    print(f"AUTH_SECRET generata e aggiunta a {ENV_LOCAL}")


def ask_password() -> str:
    """Chiede la password due volte, senza mostrarla."""
    while True:
        first = getpass.getpass("Password (non viene mostrata): ")
        if len(first) < MIN_PASSWORD_LENGTH:
            print(f"Troppo corta: servono almeno {MIN_PASSWORD_LENGTH} caratteri.")
            continue
        second = getpass.getpass("Ripeti la password: ")
        if first != second:
            print("Le due password non coincidono. Riprova.")
            continue
        return first


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", help="Obbligatorio per un nuovo admin")
    parser.add_argument("--reset-password", action="store_true", help="Cambia solo la password")
    args = parser.parse_args()

    ensure_auth_secret()

    db = get_db()
    email = args.email.strip().lower()
    now = datetime.now(timezone.utc)
    existing = db.adminusers.find_one({"email": email})

    if not existing and not args.name:
        print(f"Admin '{email}' non esiste: serve --name per crearlo.", file=sys.stderr)
        return 1

    password = ask_password()
    password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(BCRYPT_COST)).decode()

    update = {
        "passwordHash": password_hash,
        # Invalida ogni sessione aperta: i token emessi prima di questo istante cadono.
        "passwordChangedAt": now,
        "failedLoginAttempts": 0,
        "lockedUntil": None,
        "updatedAt": now,
    }
    if args.name:
        update["name"] = args.name

    db.adminusers.update_one(
        {"email": email},
        {
            "$set": update,
            "$setOnInsert": {
                "email": email,
                "role": "owner" if db.adminusers.count_documents({}) == 0 else "admin",
                "active": True,
                "lastLoginAt": None,
                "createdAt": now,
            },
        },
        upsert=True,
    )

    action = "aggiornato" if existing else "creato"
    print(f"Admin '{email}' {action}.")
    print(f"Admin totali: {db.adminusers.count_documents({})}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: Eseguire lo script**

```bash
python execution/seed_admin.py --email "yintong.zhou@icpn.it" --name "Yintong Zhou"
```

Inserire una password di almeno 12 caratteri, due volte. Atteso: `AUTH_SECRET generata e aggiunta...` seguito da `Admin 'yintong.zhou@icpn.it' creato.` e `Admin totali: 1`.

- [ ] **Step 3: Verificare il documento e la compatibilità dell'hash**

```bash
python -c "
from pymongo import MongoClient
d = MongoClient('mongodb://127.0.0.1:27017')['subsmate'].adminusers.find_one()
print('email:', d['email'], '| role:', d['role'], '| active:', d['active'])
print('hash bcrypt:', d['passwordHash'][:7], '| passwordChangedAt:', d['passwordChangedAt'] is not None)
"
```

Atteso: `role: owner`, `active: True`, hash che inizia con `$2b$12$`, `passwordChangedAt: True`.

Poi verificare che `bcryptjs` lato Node accetti l'hash prodotto da Python — è il punto di integrazione che potrebbe rompersi silenziosamente. Sostituire `LA-PASSWORD-SCELTA` con quella appena inserita:

```bash
cd frontend && node -e "
const bcrypt=require('bcryptjs');
const {MongoClient}=require('mongodb');
(async()=>{
  const c=await new MongoClient('mongodb://127.0.0.1:27017').connect();
  const a=await c.db('subsmate').collection('adminusers').findOne();
  console.log('bcryptjs accetta l hash di Python:', await bcrypt.compare('LA-PASSWORD-SCELTA', a.passwordHash));
  await c.close();
})()"
```

Atteso: `true`. Se è `false`, non proseguire: login e seed userebbero formati incompatibili.

- [ ] **Step 4: Verificare che AUTH_SECRET non venga sovrascritta**

```bash
python execution/seed_admin.py --email "yintong.zhou@icpn.it" --reset-password
```

Atteso: `AUTH_SECRET gia' presente, lasciata invariata.` e `Admin ... aggiornato.`

- [ ] **Step 5: Commit**

```bash
git add execution/seed_admin.py
git commit -m "feat(auth): script di seed degli admin"
```

---

### Task 4: Route di login e logout

**Files:**
- Create: `frontend/app/api/auth/login/route.ts`
- Create: `frontend/app/api/auth/logout/route.ts`

**Interfaces:**
- Consumes: `verifyPassword` (Task 2), `signSessionToken` / `SESSION_COOKIE` / `sessionCookieOptions` (Task 2), l'admin creato nel Task 3, gli helper `ok` / `fail` / `parseBody` / `handleError` di `lib/api.ts`
- Produces: `POST /api/auth/login` che emette il cookie di sessione; `POST /api/auth/logout` che lo cancella

- [ ] **Step 1: Creare la route di login**

```ts
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
```

- [ ] **Step 2: Creare la route di logout**

```ts
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
```

- [ ] **Step 3: Avviare il server di sviluppo**

```bash
cd frontend && npm run dev
```

- [ ] **Step 4: Verificare login riuscito, fallito e blocco**

Sostituire `LA-PASSWORD-SCELTA` con quella del Task 3.

```bash
# Credenziali corrette: atteso HTTP 200 e un header set-cookie con subsmate_session
curl -i -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"yintong.zhou@icpn.it","password":"LA-PASSWORD-SCELTA"}' | grep -Ei "^HTTP|set-cookie|error"

# Password errata: atteso HTTP 401 e il messaggio generico
curl -i -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"yintong.zhou@icpn.it","password":"sbagliata"}' | grep -Ei "^HTTP|Email o password"

# Email inesistente: atteso lo STESSO 401 e lo STESSO messaggio
curl -i -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"nessuno@icpn.it","password":"qualsiasi"}' | grep -Ei "^HTTP|Email o password"
```

Atteso: primo comando `HTTP/1.1 200` con `set-cookie: subsmate_session=...; Path=/; HttpOnly; SameSite=Lax`. Secondo e terzo: `HTTP/1.1 401` con messaggio identico.

- [ ] **Step 5: Verificare il blocco dopo cinque tentativi**

```bash
for i in 1 2 3 4 5; do
  curl -s -X POST http://localhost:3000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"yintong.zhou@icpn.it","password":"sbagliata"}' | head -c 120; echo " <- tentativo $i";
done
curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"yintong.zhou@icpn.it","password":"LA-PASSWORD-SCELTA"}'
```

Atteso: i primi cinque rispondono col messaggio generico; l'ultimo, **pur avendo la password giusta**, risponde `Account bloccato per altri 15 minuti...`.

- [ ] **Step 6: Sbloccare l'account per i task successivi**

```bash
python -c "
from pymongo import MongoClient
MongoClient('mongodb://127.0.0.1:27017')['subsmate'].adminusers.update_one(
    {}, {'\$set': {'lockedUntil': None, 'failedLoginAttempts': 0}})
print('account sbloccato')
"
```

- [ ] **Step 7: Commit**

```bash
git add frontend/app/api/auth
git commit -m "feat(auth): route di login e logout"
```

---

### Task 5: Guardie Node e protezione delle route API

**Files:**
- Create: `frontend/lib/requireAdmin.ts`
- Modify: tutte e nove le route sotto `frontend/app/api/` tranne `auth/`:
  `dashboard/route.ts`, `payments/route.ts`, `people/route.ts`, `people/[id]/route.ts`,
  `services/route.ts`, `services/[id]/route.ts`, `subscriptions/route.ts`,
  `subscriptions/[id]/route.ts`, `subscriptions/[id]/payments/route.ts`

**Interfaces:**
- Consumes: `SESSION_COOKIE` / `verifySessionToken` (Task 2), `connectToDatabase`, `AdminUser`, `fail`
- Produces:
  - `getCurrentAdmin(): Promise<CurrentAdmin | null>` dove `CurrentAdmin = { id: string; name: string; email: string; role: string }`
  - `requireAdmin(fromPath?: string): Promise<CurrentAdmin>` (redirige se non autenticato)
  - `withAdmin(handler)` che avvolge una route handler e risponde 401 se non autenticato

- [ ] **Step 1: Creare `frontend/lib/requireAdmin.ts`**

```ts
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connectToDatabase } from "@/lib/mongodb";
import { AdminUser } from "@/models/AdminUser";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session-token";
import { fail } from "@/lib/api";

/**
 * Controllo autorevole della sessione. Gira in Node runtime perche' interroga
 * MongoDB: il middleware in Edge non puo' farlo e verifica solo la firma.
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
 * Per le route API. Si usa come wrapper invece di una chiamata libera: cosi' una
 * route non protetta si nota nel diff, invece di restare aperta per dimenticanza.
 */
export function withAdmin<T extends unknown[]>(
  handler: (request: Request, ...args: T) => Promise<Response>
) {
  return async (request: Request, ...args: T): Promise<Response> => {
    const admin = await getCurrentAdmin();
    if (!admin) return fail("Autenticazione richiesta", 401);
    return handler(request, ...args);
  };
}
```

- [ ] **Step 2: Proteggere una route senza parametri (`dashboard`)**

In `frontend/app/api/dashboard/route.ts`, aggiungere l'import e rinominare l'handler esportato:

```ts
import { withAdmin } from "@/lib/requireAdmin";
```

Poi trasformare `export async function GET()` in una funzione interna avvolta:

```ts
async function handleGET() {
  try {
    return ok(await getDashboardData());
  } catch (err) {
    return handleError(err);
  }
}

export const GET = withAdmin(handleGET);
```

- [ ] **Step 3: Proteggere una route con parametri (`services/[id]`)**

Le route con `params` ricevono un secondo argomento. Il wrapper lo inoltra grazie al generico `...args`. In `frontend/app/api/services/[id]/route.ts`:

```ts
import { withAdmin } from "@/lib/requireAdmin";

async function handleGET(_request: Request, { params }: Context) {
  // corpo invariato
}

export const GET = withAdmin(handleGET);
export const PATCH = withAdmin(handlePATCH);
export const DELETE = withAdmin(handleDELETE);
```

Applicare lo stesso schema a tutte e nove le route: rinominare l'handler in `handleGET` / `handlePOST` / `handlePATCH` / `handleDELETE` lasciando il corpo invariato, e riesportarlo avvolto in `withAdmin`. Ecco i metodi esatti da avvolgere in ciascun file:

| File sotto `frontend/app/api/` | Metodi da avvolgere |
|---|---|
| `dashboard/route.ts` | GET |
| `payments/route.ts` | GET |
| `people/route.ts` | GET, POST |
| `people/[id]/route.ts` | GET, PATCH, DELETE |
| `services/route.ts` | GET, POST |
| `services/[id]/route.ts` | GET, PATCH, DELETE |
| `subscriptions/route.ts` | GET, POST |
| `subscriptions/[id]/route.ts` | GET, PATCH, DELETE |
| `subscriptions/[id]/payments/route.ts` | GET, POST |

Totale: 20 handler. Le route sotto `app/api/auth/` restano fuori.

- [ ] **Step 4: Verificare che nessuna route sia rimasta scoperta**

```bash
cd frontend && grep -rLn "withAdmin" app/api --include=route.ts | grep -v "auth/"
```

Atteso: **nessun risultato**. Ogni file che compare è una route non protetta.

- [ ] **Step 5: Verificare 401 senza cookie e 200 con cookie**

Eseguire dalla root del repo (il cookie viene salvato in `.tmp/`, che git ignora):

```bash
# Senza cookie: atteso 401 su tutte
for r in dashboard payments people services subscriptions; do
  printf "%-14s " "$r"; curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/$r"
done

# Con cookie valido: atteso 200
curl -s -c .tmp/cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"yintong.zhou@icpn.it","password":"LA-PASSWORD-SCELTA"}' > /dev/null
for r in dashboard payments people services subscriptions; do
  printf "%-14s " "$r"; curl -s -b .tmp/cookies.txt -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/$r"
done
```

Atteso: cinque `401` nel primo blocco, cinque `200` nel secondo.

- [ ] **Step 6: Verificare la revoca su disattivazione**

```bash
python -c "
from pymongo import MongoClient
MongoClient('mongodb://127.0.0.1:27017')['subsmate'].adminusers.update_one({}, {'\$set': {'active': False}})
print('admin disattivato')
"
curl -s -b .tmp/cookies.txt -o /dev/null -w "con lo stesso cookie ora: %{http_code}\n" http://localhost:3000/api/dashboard
python -c "
from pymongo import MongoClient
MongoClient('mongodb://127.0.0.1:27017')['subsmate'].adminusers.update_one({}, {'\$set': {'active': True}})
print('admin riattivato')
"
```

Atteso: `con lo stesso cookie ora: 401`. È il requisito di revoca della spec.

- [ ] **Step 7: Commit**

```bash
git add frontend/lib/requireAdmin.ts frontend/app/api
git commit -m "feat(auth): guardie di sessione e protezione delle route API"
```

---

### Task 6: Middleware, pagina di login e route group protetto

**Files:**
- Create: `frontend/middleware.ts`
- Create: `frontend/app/login/page.tsx`
- Create: `frontend/components/LoginForm.tsx`
- Create: `frontend/app/(protected)/layout.tsx`
- Move: `app/page.tsx`, `app/abbonamenti/`, `app/persone/`, `app/servizi/`, `app/pagamenti/` dentro `app/(protected)/`
- Modify: `frontend/components/Header.tsx` (bottone di logout)

**Interfaces:**
- Consumes: `requireAdmin` (Task 5), `SESSION_COOKIE` / `verifySessionToken` (Task 2), `POST /api/auth/login` e `/logout` (Task 4)
- Produces: `/login` pubblica; tutte le altre pagine protette; gli URL esistenti restano invariati

- [ ] **Step 1: Creare il middleware**

```ts
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session-token";

/**
 * Primo livello, in Edge runtime: verifica SOLO la firma del cookie.
 * Non e' autorevole - non puo' interrogare MongoDB da Edge - ma evita che una
 * pagina protetta inizi a renderizzarsi. Il controllo vero e' requireAdmin().
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
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("from", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 2: Creare il form di login**

`frontend/components/LoginForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { buttonPrimary } from "@/components/ui";

export function LoginForm({ from }: { from: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: String(form.get("email")),
        password: String(form.get("password")),
      }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error ?? "Accesso non riuscito");
      setPending(false);
      return;
    }

    router.replace(from);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">Email</span>
        <input
          type="email"
          name="email"
          required
          autoComplete="username"
          autoFocus
          className="w-full rounded-[var(--radius)] border border-[var(--border)] px-3 py-2 text-sm"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">Password</span>
        <input
          type="password"
          name="password"
          required
          autoComplete="current-password"
          className="w-full rounded-[var(--radius)] border border-[var(--border)] px-3 py-2 text-sm"
        />
      </label>

      {error ? (
        <p
          role="alert"
          className="rounded-[var(--radius)] px-3 py-2 text-sm"
          style={{
            color: "var(--status-critical)",
            backgroundColor: "color-mix(in srgb, var(--status-critical) 12%, transparent)",
          }}
        >
          {error}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className={`${buttonPrimary} w-full`}>
        {pending ? "Accesso in corso" : "Accedi"}
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Creare la pagina di login**

`frontend/app/login/page.tsx`. Il parametro `from` viene accettato solo se è un percorso relativo: impedisce redirect verso domini esterni.

```tsx
import { LoginForm } from "@/components/LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  // Solo percorsi interni: "//evil.com" e "https://evil.com" vengono scartati.
  const target = from && from.startsWith("/") && !from.startsWith("//") ? from : "/";

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="font-[family-name:var(--font-manrope)] text-[28px] font-bold leading-tight">
          SubsMate
        </h1>
        <p className="mb-6 mt-1 text-sm text-[var(--ink-muted)]">
          Accesso riservato agli amministratori.
        </p>
        <LoginForm from={target} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Spostare le pagine nel route group e creare il layout protetto**

```bash
cd frontend/app
mkdir "(protected)"
git mv page.tsx "(protected)/page.tsx"
git mv abbonamenti persone servizi pagamenti "(protected)/"
```

Creare `frontend/app/(protected)/layout.tsx`:

```tsx
import { requireAdmin } from "@/lib/requireAdmin";

/**
 * Controllo autorevole per tutte le pagine dell'app in un punto solo.
 * Il route group non cambia gli URL: le parentesi non sono un segmento di percorso.
 */
export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <>{children}</>;
}
```

- [ ] **Step 5: Aggiungere il logout nell'header**

In `frontend/components/Header.tsx`, sostituire lo `<span>` con testo `Area amministratori` con un bottone che chiama il logout:

```tsx
        <button
          type="button"
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            router.replace("/login");
            router.refresh();
          }}
          className="text-xs text-white/60 transition-colors hover:text-white"
        >
          Esci
        </button>
```

`Header.tsx` è già `"use client"` e importa `usePathname`; aggiungere `useRouter` allo stesso import da `next/navigation` e `const router = useRouter();` nel corpo del componente.

- [ ] **Step 6: Verificare che gli URL non siano cambiati e il flusso funzioni**

```bash
cd frontend && npx tsc --noEmit && npm run lint
```

Poi, con il server di sviluppo attivo, in una sessione pulita del browser:

```bash
# Senza cookie: atteso 307 verso /login?from=%2Fabbonamenti
curl -s -o /dev/null -w "redirect: %{http_code} -> %{redirect_url}\n" http://localhost:3000/abbonamenti

# /login risponde 200 senza autenticazione
curl -s -o /dev/null -w "login: %{http_code}\n" http://localhost:3000/login
```

Atteso: `redirect: 307 -> http://localhost:3000/login?from=%2Fabbonamenti` e `login: 200`.

- [ ] **Step 7: Commit**

```bash
git add frontend/middleware.ts frontend/app frontend/components
git commit -m "feat(auth): middleware, pagina di login e route group protetto"
```

---

### Task 7: Verifica end-to-end e documentazione

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`
- Create: `directives/gestione_admin.md`

**Interfaces:**
- Consumes: tutto quanto precede
- Produces: nessuna interfaccia di codice

- [ ] **Step 1: Eseguire i sei passi di verifica della spec nel browser**

Con il server attivo e una finestra privata del browser:

1. `python execution/seed_admin.py --email "yintong.zhou@icpn.it" --name "Yintong Zhou"` — la collection `adminusers` contiene un documento
2. Aprire `http://localhost:3000/` — reindirizza a `/login`; `curl http://localhost:3000/api/subscriptions` risponde 401
3. Sbagliare la password cinque volte — al quinto tentativo il messaggio indica i minuti di blocco
4. Sbloccare l'account, poi accedere con le credenziali giuste — si apre la dashboard; `/api/subscriptions` risponde 200
5. Impostare `active: false` da database — la richiesta successiva riporta a `/login`
6. Riattivare, rientrare, premere **Esci** — si torna a `/login` e le API rispondono di nuovo 401

Annotare l'esito di ciascun passo. Se uno fallisce, correggere prima di proseguire.

- [ ] **Step 2: Aggiornare README.md**

Nella sezione `## Avvio rapido`, dopo il blocco degli script Python, aggiungere:

```markdown
Creare il primo admin (genera anche `AUTH_SECRET`):

```bash
python execution/seed_admin.py --email "tua@email.it" --name "Nome Cognome"
```
```

Nella sezione `## Stato`, sostituire la riga dell'autenticazione con:

```markdown
- [x] Autenticazione admin (login email + password, sessione 7 giorni, blocco dopo 5 tentativi)
```

- [ ] **Step 3: Aggiungere la sezione auth a CLAUDE.md**

Dopo la sezione `## Modello dati`, inserire:

```markdown
## Autenticazione

Due livelli, non ridondanti: `middleware.ts` gira in **Edge** e verifica solo la firma del
cookie; `requireAdmin()` / `withAdmin()` girano in **Node** e fanno il controllo autorevole
su database (admin attivo, password non cambiata dopo l'emissione del token). Il middleware
non puo' interrogare Mongo da Edge, quindi non e' sufficiente da solo.

- `lib/session-token.ts` contiene **solo** jose ed e' l'unico modulo auth importabile dal
  middleware. Non importarci `bcryptjs`: finirebbe nel bundle Edge.
- Ogni nuova route sotto `app/api/` va esportata avvolta in `withAdmin()`. Verifica con:
  `grep -rLn "withAdmin" app/api --include=route.ts | grep -v auth/` — non deve stampare nulla.
- Gli account si creano solo con `python execution/seed_admin.py`. Non esistono registrazione,
  inviti o reset self-service, ed e' una scelta: vedi la spec in `docs/superpowers/specs/`.
```

- [ ] **Step 4: Creare la direttiva operativa**

`directives/gestione_admin.md`:

```markdown
# Direttiva: Gestione degli account admin

## Obiettivo
Creare, aggiornare e revocare gli accessi amministratore di SubsMate.

## Creare un admin
```bash
python execution/seed_admin.py --email "nome@icpn.it" --name "Nome Cognome"
```
La password si inserisce a schermo, mai come argomento: finirebbe nella cronologia della
shell. Minimo 12 caratteri. Il primo admin creato riceve il ruolo `owner`, i successivi `admin`;
al momento i due ruoli hanno gli stessi poteri.

## Cambiare una password dimenticata
```bash
python execution/seed_admin.py --email "nome@icpn.it" --reset-password
```
Aggiorna `passwordChangedAt`, quindi **tutte le sessioni aperte di quell'admin cadono**.

## Revocare un accesso
Impostare `active: false` sul documento in `adminusers`. La sessione cade alla richiesta
successiva. Non cancellare il documento: si perderebbe il riferimento storico.

## Casi limite
- **`AUTH_SECRET` cambiata o rigenerata**: tutte le sessioni di tutti gli admin cadono. E'
  la leva da usare se si sospetta che un cookie sia stato esfiltrato.
- **Account bloccato per tentativi falliti**: si sblocca da solo dopo 15 minuti, oppure
  azzerando `lockedUntil` e `failedLoginAttempts` sul documento.
- **Nessun admin in database**: ogni pagina reindirizza a `/login` e nessuna credenziale
  funziona. Si esce solo rieseguendo il seed.
```

- [ ] **Step 5: Verifica finale e commit**

```bash
cd frontend && npx tsc --noEmit && npm run lint && npm run build
```

Atteso: nessun errore; nella lista delle route della build compaiono `/login` e le pagine esistenti agli URL invariati (`/`, `/abbonamenti`, `/persone`, `/servizi`, `/pagamenti`).

```bash
cd .. && git add README.md CLAUDE.md directives/gestione_admin.md
git commit -m "docs: autenticazione admin"
```
