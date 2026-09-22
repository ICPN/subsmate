# Autenticazione admin — design

Data: 2026-09-22
Stato: approvato in brainstorming, da implementare

## Obiettivo

Proteggere SubsMate con login email + password per gli admin. Oggi l'app è
completamente aperta: chiunque raggiunga l'URL vede anagrafiche, importi e storico
pagamenti. Su Vercel sarebbe pubblica su Internet.

Il modello `AdminUser` esiste già (`frontend/models/AdminUser.ts`) ma non è usato da
nulla: non ci sono route di login, middleware o controlli di sessione.

## Requisiti decisi

| Requisito | Scelta | Motivo |
|---|---|---|
| Creazione account | Solo script di seed | 2-5 persone fidate: niente registrazione, inviti o reset self-service da mantenere e da attaccare |
| Revoca sessione | Controllo a ogni richiesta | `active: false` deve essere un interruttore vero; 1 lettura per richiesta è irrilevante a questi volumi |
| Durata sessione | 7 giorni | Strumento usato saltuariamente; una sessione rubata ha comunque vita limitata |
| Test | Verifica manuale | Il repo non ha framework di test e non se ne introduce uno ora |

## Approccio scelto

Cookie di sessione firmato + helper `requireAdmin()` in Node runtime.

Scartati:

- **Auth.js / NextAuth v5** — dipendenza pesante per 2-5 utenti; il Credentials provider
  è il percorso meno supportato della libreria e il controllo `active` per richiesta va
  comunque aggiunto a mano nei callback. Più configurazione che codice risparmiato.
- **Sessioni opache in collection `sessions`** — risolve la revoca, già coperta qui, e in
  più offre la lista dei dispositivi attivi, che non è stata richiesta. Aggiunge una
  collection e un ciclo di vita (TTL index, cleanup) senza contropartita.

## Vincolo tecnico che guida il design

Il middleware di Next.js gira in **Edge runtime**, dove Mongoose non funziona. La verifica
su database non può stare nel middleware: deve avvenire in Node runtime, cioè nei layout e
nelle route handler. Da qui i due livelli descritti sotto.

## Modello dati

### `AdminUser` — campi da aggiungere

| Campo | Tipo | Scopo |
|---|---|---|
| `passwordChangedAt` | `Date` | Confrontato con l'`iat` del token: cambiare password invalida le sessioni aperte |
| `failedLoginAttempts` | `Number`, default 0 | Contatore per il blocco anti forza bruta |
| `lockedUntil` | `Date \| null` | Istante fino al quale l'account è bloccato |

Campi già presenti e usati così come sono: `name`, `email` (unique, lowercase),
`passwordHash` (`select: false`), `role`, `active`, `lastLoginAt`.

Il campo `role` (`admin` | `owner`) viene memorizzato ma **non è applicato**: in questa
fase tutti gli admin hanno gli stessi poteri. Serve solo a non dover migrare lo schema se
in futuro servissero permessi differenziati.

### Collection

`adminusers` viene creata dallo script di seed sul MongoDB locale (`mongodb://127.0.0.1:27017`,
database `subsmate`). Nessun'altra collection nuova.

## File

### Nuovi

| File | Ruolo |
|---|---|
| `frontend/lib/auth.ts` | hash e verifica password (bcryptjs), firma e verifica JWT (jose), lettura/scrittura del cookie |
| `frontend/lib/requireAdmin.ts` | `getCurrentAdmin()`, `requireAdmin()`, wrapper `withAdmin()` per le route API |
| `frontend/middleware.ts` | Edge: verifica la firma del cookie, redirige a `/login` |
| `frontend/app/login/page.tsx` | form di login, unica pagina pubblica |
| `frontend/app/api/auth/login/route.ts` | valida le credenziali, emette il cookie |
| `frontend/app/api/auth/logout/route.ts` | cancella il cookie |
| `frontend/app/(protected)/layout.tsx` | route group protetto: chiama `requireAdmin()` una volta per tutte le pagine |
| `execution/seed_admin.py` | crea l'admin e la collection `adminusers` |

### Modificati

- Le cinque pagine attuali (`page.tsx`, `abbonamenti/`, `persone/`, `servizi/`, `pagamenti/`)
  si spostano dentro `app/(protected)/`. **Gli URL non cambiano**: le parentesi sono un
  route group, non un segmento di percorso.
- Le route handler sotto `app/api/` (tranne `auth/login`) vengono avvolte in `withAdmin()`.
- `frontend/models/AdminUser.ts` — i tre campi nuovi.
- `.env.example` e `.env.local` — `AUTH_SECRET`.
- `execution/requirements.txt` — `bcrypt`.
- `frontend/package.json` — `jose`, `bcryptjs`, `@types/bcryptjs`.

## Flusso

### Login

1. `POST /api/auth/login` con `{ email, password }`, validati con Zod come il resto delle API.
2. Carica l'admin con `+passwordHash`. Se non esiste, se `active === false`, o se
   `lockedUntil` è nel futuro, si ferma qui.
3. `bcrypt.compare` sulla password.
4. Fallimento: incrementa `failedLoginAttempts`; al quinto imposta `lockedUntil = now + 15 min`
   e azzera il contatore.
5. Successo: azzera `failedLoginAttempts` e `lockedUntil`, aggiorna `lastLoginAt`, firma un
   JWT `{ sub: adminId, iat, exp: now + 7 giorni }` con HS256 e `AUTH_SECRET`, lo scrive nel
   cookie `subsmate_session` (`httpOnly`, `sameSite=lax`, `path=/`, `secure` in produzione).

### Ogni richiesta

| Livello | Runtime | Verifica | Costo |
|---|---|---|---|
| `middleware.ts` | Edge, senza DB | cookie presente e firma valida, altrimenti redirect a `/login` | ~0 |
| `requireAdmin()` | Node, con DB | l'admin esiste, `active === true`, `passwordChangedAt <= iat` | 1 lettura |

I due livelli non sono ridondanti. Il middleware non può interrogare Mongo, quindi **non è
autorevole**: blocca chi non ha cookie ed evita che una pagina protetta inizi a
renderizzarsi. `requireAdmin()` è il controllo vero.

Percorsi pubblici, esclusi dal middleware: `/login`, `/api/auth/login`, `/_next/*`,
`/favicon.ico` e gli asset statici.

### Protezione delle route API

Le route handler usano `withAdmin(handler)` invece di una chiamata libera a `requireAdmin()`.
Motivo: se in futuro si aggiunge una route e si dimenticasse la chiamata, quella route
resterebbe aperta. Col wrapper la protezione è parte della forma del file e una route non
protetta si nota nel diff.

### Logout

`POST /api/auth/logout` cancella il cookie e reindirizza a `/login`. **Non** è avvolto in
`withAdmin()`: deve funzionare anche con una sessione già scaduta o invalida, perché il suo
effetto — rimuovere il cookie — è sicuro in ogni caso.

### Revoca

Disattivare un admin (`active: false`) o cambiargli la password (`passwordChangedAt`
aggiornato) fa cadere la sessione **alla richiesta successiva**, perché il controllo è per
richiesta.

## Errori

- Email inesistente, password errata e account disattivato producono lo **stesso** messaggio:
  "Email o password non corretti". Messaggi distinti trasformerebbero il form in uno strumento
  per scoprire quali email sono registrate.
- L'account bloccato fa eccezione e lo dichiara, con i minuti mancanti: l'informazione serve
  all'utente legittimo e non rivela nulla a chi non conosce già la password.
- **Limite accettato consapevolmente:** con un'email inesistente la risposta arriva prima,
  perché `bcrypt.compare` non viene eseguito. In teoria i tempi permettono di distinguere le
  email registrate. Non lo mitighiamo: su cinque account interni la differenza è dentro il
  rumore della rete, e il blocco dopo cinque tentativi limita comunque il sondaggio. Se un
  giorno servisse, si esegue un confronto bcrypt fittizio sul ramo "utente non trovato".
- Pagine: redirect a `/login?from=<percorso>`; dopo l'accesso si torna al percorso di partenza.
  Il parametro `from` viene accettato solo se è un percorso relativo che inizia con `/`, per
  evitare redirect verso domini esterni.
- API: 401 JSON tramite l'helper `fail()` già presente in `lib/api.ts`, coerente col resto.

## Seed

```bash
python execution/seed_admin.py --email "yintong.zhou@icpn.it" --name "Yintong Zhou"
```

- La password **non** si passa come argomento: finirebbe nella cronologia della shell. Lo
  script la chiede in input nascosto e la conferma una seconda volta.
- Genera l'hash bcrypt (cost 12) e crea o aggiorna il documento. Gli hash bcrypt di Python e
  di `bcryptjs` sono compatibili.
- Idempotente sull'email, come gli altri script del repo. `--reset-password` rigenera solo la
  password di un admin esistente e aggiorna `passwordChangedAt`.
- Se `AUTH_SECRET` manca in `frontend/.env.local`, lo genera (32 byte casuali, base64url) e lo
  aggiunge in coda senza toccare le righe esistenti.

## Verifica

Manuale, contro il MongoDB locale. Il repo non ha framework di test e non se ne introduce uno.

1. `python execution/seed_admin.py --email "yintong.zhou@icpn.it" --name "Yintong Zhou"` crea
   l'admin; la collection `adminusers` compare con un documento.
2. Aprire `/` da sessione pulita reindirizza a `/login`. `GET /api/subscriptions` risponde 401.
3. Login con password errata cinque volte blocca l'account; il messaggio indica i minuti.
4. Login corretto porta alla dashboard; `/api/subscriptions` torna a rispondere 200.
5. Impostare `active: false` sull'admin dal database: la richiesta successiva riporta a `/login`.
6. Logout riporta a `/login` e `/api/subscriptions` risponde di nuovo 401.

## Fuori scope

- Permessi differenziati per ruolo
- Reset password self-service, recupero via email, inviti
- 2FA
- Lista e chiusura delle sessioni attive per dispositivo
- Rate limiting per indirizzo IP (il blocco è per account)
