---
type: handoff
date: 2026-10-07
status: in corso
seq: 2
prev: docs/handoff/2026-10-07-correzioni-audit.md
tags: [subsmate, audit, sicurezza, credito-primo-mese, emoji, readme]
---

# Handoff — correzioni dell'audit Codex (2)

## Obiettivo

SubsMate sostituisce il Google Sheet degli abbonamenti condivisi del team ICPN (Claude,
ChatGPT). L'obiettivo di questo filone è chiudere i problemi di gravità alta e media trovati
dall'audit di Codex (`docs/audit/2026-10-07-revisione-codex.md`), perché toccano i conti
(pagamenti, crediti, migrazioni) e la sicurezza (credenziali, login).

## A che punto siamo

- **Committato in `5f15a5a`** (da un'altra sessione o dall'utente): guida, documento
  dell'audit, primo handoff e **molte correzioni dell'audit**. Tra queste: transazioni
  (`inTransaction` in `lib/mongodb.ts` con `transactionAsyncLocalStorage`), blocco del login
  atomico (`claimAttempt` / `registerFailedAttempt` / `clearAttempts` e `DUMMY_HASH` in
  `lib/auth.ts`), schema di modifica dell'abbonamento senza `person` e `service`, controlli
  su donazione e importo zero, password tolta da `docs/handoff/2026-09-22-admin-auth.md`.
  **Quali finding siano chiusi davvero non è stato verificato**: è il prossimo passo.
- **Fatto in questa sessione, verificato, NON committato:**
  - credito del primo mese **della persona**, spendibile su qualunque suo abbonamento
    (ChatGPT o Claude), con il blocco anti doppia spesa spostato sul documento `Person`;
  - `README.md` riscritto;
  - emoji mirate (saluto, contatori di stato, stati vuoti, conferme, guida) con le regole in
    `brand-guidelines.md` §6 e §8.
  Typecheck, lint e build passano; prove end-to-end su `subsmate_dev` riuscite.

## Cosa abbiamo provato che NON ha funzionato

- **Calcolo del credito primo mese per abbonamento**: impediva di usarlo su Claude per chi ha
  anche ChatGPT. Ora è per persona; non tornare indietro.
- **Blocco anti doppia spesa sull'abbonamento**: con il credito per persona non basta, due
  pagamenti simultanei su abbonamenti diversi lo spendevano due volte. Il blocco ora è una
  scrittura su `Person` dentro la transazione (provato: secondo pagamento 409).
- **Query in parallelo (`Promise.all`) dentro una transazione**: non ammesse; le funzioni
  usate dalle rotte che scrivono fanno le query in sequenza.
- Dalla sessione precedente: niente `.default()` negli schemi Zod da cui si ricava un
  `.partial()`; niente import da `models/` nei Client Component; normalizzare i fine riga
  CRLF prima di sostituzioni con script.

## Problemi incontrati e come li abbiamo risolti

- **Dev server già attivo sulla 3000 (PID 29284), non avviato da noi**: un `npm run dev` nuovo
  ripiega sulla 3001 e si chiude. Quel server serve la stessa cartella con `subsmate_dev`,
  quindi le prove su di lui sono valide. Non fermarlo senza chiedere.
- **Login nei test senza conoscere la password**: firmare un JWT con `AUTH_SECRET` di
  `frontend/.env.local` (jose, `sub` = id admin). Solo dati di prova con email `prova-…`,
  cancellati alla fine.

## Decisioni prese

- **Credito primo mese della persona**, non dell'abbonamento (correzione dell'utente). Una
  migrazione trasferisce tutto il disponibile della persona. Scartato: tracciare da quale
  abbonamento nasce il credito, complessità senza beneficio.
- **Emoji mirate**, scelte fra tre opzioni. Scartate: icone lineari al posto delle emoji, ed
  emoji ovunque (menu, bottoni). Le guidelines sono state aggiornate per ammetterle solo nei
  punti elencati, sempre `aria-hidden`.
- **README**: tolta la checklist di stato (invecchia subito) e la nota sulla rete ICPN che
  bloccava la 27017 (non vale più).
- **Prossimo passo scelto dall'utente: la verifica dell'audit**, non il commit né la prova
  visiva delle emoji.
- Restano valide dalla sessione precedente: audit B4 non è un bug; «Sospeso» lasciato com'è.

## File toccati (non committati)

- `frontend/lib/queries.ts` — `firstCycleCreditByPerson`, `getFirstCycleCreditAvailable(personId)`.
- `frontend/app/api/subscriptions/[id]/payments/route.ts` — blocco su `Person`, credito per persona.
- `frontend/app/api/migrations/[id]/execute/route.ts` — idem, trasferisce il disponibile della persona.
- `frontend/components/ui.tsx` — componente `Emoji`, `emoji` su `StatCard` ed `EmptyState`, `Card.title` ReactNode.
- `frontend/components/Toast.tsx` — ✅ davanti alle conferme.
- `frontend/components/PageHeader.tsx` — `description` ReactNode.
- `frontend/app/(protected)/page.tsx` — saluto con il nome, emoji sui contatori, stati vuoti.
- `frontend/app/(protected)/{abbonamenti/[id],pagamenti,persone,servizi}/page.tsx`,
  `frontend/components/SubscriptionsTable.tsx` — emoji negli stati vuoti.
- `frontend/app/(protected)/guida/page.tsx` — emoji per sezione, credito della persona.
- `brand-guidelines.md`, `CLAUDE.md`, `README.md` — regole emoji, credito per persona, README nuovo.

## Dove vogliamo andare

1. Verifica sul codice, uno per uno, i finding alti e medi di
   `docs/audit/2026-10-07-revisione-codex.md` (B1–B3, B5–B10, S1–S3): per ciascuno decidi
   **chiuso**, **aperto** o **non è un bug**, partendo da quanto contiene `5f15a5a`.
2. Correggi quelli aperti, con prova su `subsmate_dev`.
3. Per S1 e S2 chiedi conferma prima di agire sulla produzione: cambio password admin e
   Atlas, riscrittura della cronologia Git (force push), ACL dei file, allowlist Atlas
   (`0.0.0.0/0` serve a Vercel), nuovo deploy.
4. Aggiungi al documento dell'audit una colonna «Stato» con l'esito di ogni finding.

## Da sapere prima di toccare qualcosa

- Le transazioni funzionano su Atlas (replica set), **non** sul MongoDB locale standalone.
- Le rotte che scrivono in transazione: ogni rifiuto (`return fail`) va prima della prima
  scrittura, dopo si lancia un errore, altrimenti la transazione si conferma a metà.
- Il lint segnala sempre un avviso in `frontend/.tmp/diff-profondo.mts`: file ignorato da
  git, non è un problema.
- Verifica: `npx tsc --noEmit`, `npm run lint`, `npm run build`, i due `grep` di
  `withAdmin`/`requireAdmin`, prova su `subsmate_dev`. Nessun framework di test.
- Le modifiche elencate sopra non sono committate: chiedi all'utente se committarle prima di
  iniziare, per non mescolarle con le correzioni dell'audit.
