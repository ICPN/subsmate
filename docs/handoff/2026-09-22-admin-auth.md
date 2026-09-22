---
type: handoff
date: 2026-09-22
status: pronto-per-review
seq: 1
prev: nessuno
tags: [subsmate, autenticazione, next16, mongodb, brand-guidelines]
---

## Obiettivo

SubsMate sostituisce il Google Sheet manuale con cui ICPN gestisce gli abbonamenti condivisi
ai servizi LLM (Claude, ChatGPT, estendibile). Serve perché sul Sheet le scadenze non sono
allineate, chi ha più abbonamenti è difficile da tracciare, e non esiste alcun automatismo
per quote, scadenze e stato dei pagamenti. Scope completo in `PROJECT.md`.

In questa sessione il progetto è stato costruito da zero — modelli, motore di calcolo, API,
UI — e infine protetto con l'autenticazione admin, che era l'ultimo pezzo mancante prima
dell'import dei dati reali.

## A che punto siamo

**Funziona, verificato a runtime su MongoDB locale:**

- Modelli `Service` / `Person` / `Subscription` / `Payment` / `AdminUser`
- Motore di calcolo `lib/billing.ts`: quota, totale dovuto, prossima scadenza, stato
- 11 route API, tutte protette tranne login e logout
- UI completa sulle brand guidelines: dashboard, abbonamenti con filtri, scheda con
  registrazione pagamento, persone, servizi, pagamenti
- Autenticazione admin: login, logout, sessione 7 giorni, blocco dopo 5 tentativi,
  revoca alla richiesta successiva

**Stato dei branch:**

- `main` è **2 commit avanti rispetto a origin** (spec `772bb06` e piano `3934c92`): non
  ancora pushati su GitHub
- `feat/admin-auth` — 12 commit, 36 file, +739/−40, **non mergiato e non pushato**.
  Review finale whole-branch pulita, verdetto "pronto per il merge".
  L'utente ha scelto di lasciarlo così com'è.

**Non ancora iniziato:** import reale dal Google Sheet, deploy su Vercel, connessione ad Atlas.

## Cosa abbiamo provato che NON ha funzionato

- **Connessione a MongoDB Atlas: abbandonata, non è un problema risolvibile dal codice.**
  La rete ICPN blocca la porta 27017 in uscita verso qualsiasi host (80/443/8080 passano,
  27017 viene resettata anche verso `portquiz.net`, che non ha whitelist). Non riprovare
  Atlas da questa rete e non cercare la causa nel codice o nell'URI.
- **Prima diagnosi sbagliata sullo stesso problema: "IP non autorizzato in Atlas".** Ha
  fatto aggiungere l'IP alla whitelist senza alcun effetto. Il sintomo (TLS resettato su
  tutti i nodi dopo un TCP riuscito) è identico nei due casi: usare
  `execution/check_db_connection.py`, che li distingue automaticamente.
- **git worktree per l'esecuzione del piano: scartato.** Ogni task verificava a runtime e
  dipendeva da `frontend/.env.local` (git-ignored) e da `node_modules`, che un worktree
  fresco non avrebbe avuto. Usato un branch normale.
- **`getpass` con stdin convogliato: non funziona** su Windows in sessione non interattiva
  (legge dalla console, non da stdin). Per questo `seed_admin.py` non è stato eseguito
  davvero dai subagent.
- **Tool Bash con heredoc molto lunghi: troncati** a metà, con errore `unexpected EOF`.
  Per file oltre ~150 righe usare il tool Write.

## Problemi incontrati e come li abbiamo risolti

- **TLS resettato su tutti i nodi Atlas.** Sintomo: DNS e TCP passano, l'handshake TLS viene
  chiuso senza alert. Causa: porta 27017 bloccata dalla rete, non Atlas. Correzione: sviluppo
  su MongoDB Community locale, `frontend/.env.local` con entrambe le URI e quella Atlas
  commentata.
- **`atlas-credentials.env` non coperto dal `.gitignore`.** `.env` non intercetta
  `atlas-credentials.env`. Correzione: regola `*.env`. Le credenziali non erano mai state
  committate.
- **Commit firmato con l'identità di lavoro** (`y.zhou@sirti.it`) e già pushato. Correzione:
  identità git **locale** al repo (`yintong-zhou <zhouyintong96@gmail.com>`), commit riscritto,
  force-push con `--force-with-lease`. La globale Sirti è rimasta intatta.
- **Il click del browser tool cade fuori dal bersaglio:** il frame delle coordinate è scalato
  (800 px) rispetto alla pagina reale (1280 px). Sembra un bug dell'app, non lo è. Verificare
  i form con `requestSubmit()` via JS, non col click.

## Decisioni prese

- **Next.js API routes + MongoDB**, scartati FastAPI separato e Prisma/Postgres: un solo
  runtime da deployare su Vercel free.
- **Niente stato calcolabile nel database.** Quota, scadenza e stato sono derivati a ogni
  lettura da `lib/billing.ts`. Scartato il salvataggio dei campi: è ciò che rompe il Sheet.
- **Cookie di sessione firmato**, scartati Auth.js (dipendenza pesante per 2-5 utenti, il
  Credentials provider è il percorso meno supportato) e le sessioni opache in collection
  (risolve la revoca, già coperta, e aggiunge una lista dispositivi non richiesta).
- **`lib/session-token.ts` separato da `lib/auth.ts`**, deviazione dalla spec: il middleware
  gira in Edge e un modulo unico ci trascinerebbe `bcryptjs`.
- **Account solo da script di seed**, scartati registrazione libera e inviti: 2-5 persone
  fidate, superficie d'attacco minima.
- **Side-channel temporale del login: accettato consapevolmente.** Scartato il confronto
  bcrypt fittizio. Attenzione: la motivazione scritta nella spec ("dentro il rumore della
  rete") è **sbagliata** — il differenziale bcrypt cost 12 è 200-400 ms. Regge per un'altra
  ragione: con 2-5 indirizzi `@icpn.it` prevedibili non c'è nulla da enumerare.
- **Nessun framework di test**, scelta esplicita dell'utente: verifica con build + lint +
  sonde HTTP/RSC. Non introdurne uno senza chiedere.
- **Header e footer spostati** nel layout protetto, deviazione dal piano: altrimenti la
  pagina di login mostrava la navigazione e il bottone "Esci" a chi non è autenticato.

## File toccati

| Percorso | Cosa contiene |
|---|---|
| `frontend/lib/billing.ts` | Motore di calcolo, funzioni pure con `now` iniettabile |
| `frontend/lib/queries.ts` | Unica fonte di lettura, condivisa fra pagine e API |
| `frontend/lib/session-token.ts` | Firma/verifica JWT, **solo jose**, importabile da Edge |
| `frontend/lib/auth.ts` | `verifyPassword` con bcryptjs, solo Node |
| `frontend/lib/requireAdmin.ts` | `getCurrentAdmin`, `requireAdmin`, `withAdmin` |
| `frontend/middleware.ts` | Primo livello Edge: solo firma del cookie |
| `frontend/app/(protected)/` | Le 6 pagine + layout con `requireAdmin()` |
| `frontend/app/login/` | Unica pagina pubblica |
| `frontend/app/api/` | 9 route dati avvolte in `withAdmin` + `auth/login`, `auth/logout` |
| `execution/seed_admin.py` | Crea gli admin, genera `AUTH_SECRET` |
| `execution/check_db_connection.py` | Diagnosi DNS / TCP / TLS / auth |
| `execution/import_subs_from_sheet.py` | Import dal Sheet, **mai eseguito su dati reali** |
| `directives/` | 5 SOP, incluse `setup_ambiente.md` e `gestione_admin.md` |
| `docs/superpowers/` | Spec e piano dell'autenticazione |

## Dove vogliamo andare

1. **Rigenerare la password admin** da un terminale interattivo — ora nel database locale
   c'è quella di prova usata dall'automazione:
   `python execution/seed_admin.py --email "yintong.zhou@icpn.it" --reset-password`
2. **Decidere su `feat/admin-auth`**: mergiare in `main` oppure aprire una PR. Il branch è
   pronto, review finale pulita.
3. **Import dal Google Sheet** "Application AI Team Plan", tab `Subs`: esportare il CSV in
   `.tmp/subs_export.csv`, lanciare `python execution/import_subs_from_sheet.py --dry-run`,
   controllare il report, poi eseguire davvero. Procedura in
   `directives/import_google_sheet.md`. Prima di importare, rimuovere i dati demo con
   `python execution/seed_demo_data.py --reset`.

Dopo: deploy su Vercel + Atlas, che richiede di risolvere il nodo della whitelist per le
funzioni serverless (sul piano free l'unica strada pratica è `0.0.0.0/0`, che rende la
password del database l'unica difesa).

## Da sapere prima di toccare qualcosa

- **Atlas non è raggiungibile da questa rete.** Prima di indagare qualsiasi errore di
  connessione, lanciare `python execution/check_db_connection.py`.
- **Ogni nuova route API va avvolta in `withAdmin()`**, ogni nuova pagina protetta deve
  chiamare `await requireAdmin(<percorso>)` in testa. Il layout del route group **non basta**:
  in App Router non viene rieseguito durante le navigazioni soft, e una sessione revocata
  continuerebbe a leggere dati per 7 giorni. Verifiche:
  `grep -rL "withAdmin" app/api --include=route.ts | grep -v auth/` e
  `grep -rL "requireAdmin" "app/(protected)" --include=page.tsx` — nessuno dei due deve
  stampare qualcosa.
- **Non importare `bcryptjs` o Mongoose in `middleware.ts`**: finirebbero nel bundle Edge.
- **L'admin locale ha la password di prova `SubsMateTest2026!`** finché non viene rigenerata.
- **Il blocco anti forza bruta è per account**: chi conosce le email può tenere bloccati tutti
  gli admin. Procedura di sblocco in `directives/gestione_admin.md`.
- **Un dev server Next potrebbe essere ancora attivo** su `localhost:3000`: prima di avviarne
  uno, verificare.
- **`.superpowers/` è git-ignored** e il suo contenuto è stato eliminato: i report dei
  subagent non esistono più, la storia è nei commit.
- Rilievi minori noti e non corretti, non bloccanti: `fetch` senza `catch` in `LoginForm` e
  nel logout dell'header, `/login` non redirige chi ha già una sessione valida, il matcher
  del middleware esclude ogni percorso con un punto.
