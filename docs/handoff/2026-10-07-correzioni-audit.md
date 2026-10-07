---
type: handoff
date: 2026-10-07
status: in corso
seq: 1
prev: nessuno
tags: [subsmate, audit, sicurezza, guida, credito-primo-mese, profilo]
---

# Handoff — correzioni dell'audit Codex

## Obiettivo

SubsMate sostituisce il Google Sheet degli abbonamenti condivisi del team ICPN (Claude,
ChatGPT). Dopo aver aggiunto credito del primo mese, profilo admin e guida, l'utente vuole
correggere **tutti i problemi di gravità alta e media** emersi dall'audit di Codex, perché
toccano conti (pagamenti, crediti, migrazioni) e sicurezza (credenziali, login).

## A che punto siamo

- **Committato dall'utente:** credito del primo mese, profilo admin, fix Zod `.default()`,
  azioni nascoste sulle righe credito migrazione (`acd2712`, `875c3c0`).
- **Fatto, verificato, NON committato:**
  - pagina `/guida` per compito + link nell'header;
  - stato calcolato «Cessato» (badge neutro, fuori da ritardi e «da seguire», filtro «Cessati»,
    contatore «In regola» contato e non per differenza);
  - testo della conferma di eliminazione pagamento corretto (la scadenza ricade sulla data
    di inizio, non sparisce);
  - `docs/audit/2026-10-07-revisione-codex.md`: i 16 finding in tabelle, con note.
  Tutto passa typecheck, lint e build; provato end-to-end su `subsmate_dev`.
- **Non iniziato:** nessuna correzione dell'audit. L'utente ha detto «fermo» mentre leggevo
  `lib/mongodb.ts` e `app/api/migrations/[id]/route.ts`; nessun file modificato.

## Cosa abbiamo provato che NON ha funzionato

- **PATCH parziale dell'abbonamento nei test.** Inviare solo `firstCycleProviderCharge`
  riportava l'abbonamento a mensile/0/«da attivare»: Zod 4 riapplica i `.default()` dentro
  `.partial()`. Risolto togliendo i default (commit `875c3c0`); non rimetterli.
- **Importare `CREDIT_KINDS` da `models/Payment.ts` in un Client Component**: porta mongoose
  nel bundle del browser. Le costanti dei crediti stanno in `lib/billing.ts`.
- **Script di edit con `node` sui file del repo senza normalizzare i fine riga**: i file sono
  CRLF e le sostituzioni non trovano il testo. Normalizzare a LF, sostituire, riscrivere CRLF.

## Problemi incontrati e come li abbiamo risolti

- **Dev server «fantasma» sulla 3000** (PID 29284, non avviato da me): un `npm run dev` nuovo
  ripiega sulla 3001 e si chiude. Le prove sono comunque valide perché quel server serve la
  stessa cartella e punta a `subsmate_dev` (verificato: autenticava un admin inserito lì).
  Non fermarlo senza chiedere.
- **Login nei test senza conoscere la password**: si firma un JWT con `AUTH_SECRET` di
  `frontend/.env.local` (jose, `sub` = id admin). Usare solo dati di prova con email
  `prova-…` e cancellarli alla fine (memoria: mai cancellare dati di persone vere).

## Decisioni prese

- **Credito primo mese**: salvato `firstCycleCredit` (fissato alla tariffa del momento) e non
  derivato, perché la tariffa può cambiare; disponibile calcolato. Scartato: agganciarlo in
  anticipo al ciclo successivo (un pagamento in ritardo lo lascerebbe sul ciclo sbagliato).
- **Il credito primo mese passa sempre nelle migrazioni**, anche `a_scadenza`, fuori dal tetto
  «mai più dell'incassato». Richiesta esplicita dell'utente («dare quello che gli altri hanno
  pagato»).
- **Profilo: solo il proprio account** (opzione A). Scartata la gestione degli altri admin.
- **Guida per compito, per gli admin di oggi** (opzione A). Scartati screenshot e ricerca
  interna.
- **«Sospeso» lasciato com'è** (può risultare in ritardo): l'utente ha chiesto solo i cessati.
- **Audit B4 (`outstanding` = 0 senza pagamenti) non è un bug**: «Da incassare» conta solo i
  residui dei cicli pagati in parte. Non correggerlo.
- **Audit S4 cita un percorso sbagliato**: la rotta profilo è `app/api/account/route.ts`.

## File toccati (non committati)

- `frontend/app/(protected)/guida/page.tsx` — nuova pagina Guida.
- `frontend/components/Header.tsx` — link «Guida» (desktop e menu mobile).
- `frontend/lib/billing.ts` — stato `cessato`, etichetta, `statusDetail`.
- `frontend/components/StatusBadge.tsx` — colore neutro per `cessato`.
- `frontend/lib/queries.ts` — contatore `in_regola` contato esplicitamente.
- `frontend/app/(protected)/abbonamenti/page.tsx` — filtro «Cessati».
- `frontend/components/PaymentRowActions.tsx` — testo della conferma di eliminazione.
- `CLAUDE.md` — regola: chi cambia un comportamento descritto in `/guida` la aggiorna.
- `docs/audit/2026-10-07-revisione-codex.md` — finding dell'audit in tabelle.

## Dove vogliamo andare

1. Committa il lavoro aperto (guida, stato «Cessato», documento audit), in commit separati.
2. Riprendi le correzioni alte e medie dell'audit, **verificando ogni finding sul codice prima
   di correggerlo**. Ordine: S1 (password in chiaro in `docs/handoff/2026-09-22-admin-auth.md`
   e `directives/gestione_admin.md`), poi S2, S3, B1, B2, poi le medie (B3, B5–B10).
3. Per tutto ciò che tocca la produzione chiedi conferma prima: cambio password di admin e
   Atlas, riscrittura della cronologia Git (force push), allowlist Atlas (`0.0.0.0/0` serve a
   Vercel), nuovo deploy.

## Da sapere prima di toccare qualcosa

- B1, B2, B8 propongono transazioni MongoDB: funzionano su Atlas (replica set) ma **non** sul
  MongoDB Community locale standalone indicato in `CLAUDE.md` come ripiego offline.
- Restringere l'allowlist Atlas rompe Vercel (IP dinamici): va valutata con l'utente.
- Il lint segnala sempre un avviso in `frontend/.tmp/diff-profondo.mts`: file intermedio
  ignorato da git, non è un problema.
- Non esiste framework di test: verifica = `npx tsc --noEmit`, `npm run lint`,
  `npm run build`, i due `grep` di `withAdmin`/`requireAdmin` e prova su `subsmate_dev`.
- `directives/registrazione_pagamento.md` è superata (dice che i pagamenti sono immutabili e
  che i parziali non si tracciano): aggiornarla quando capita, chiedendo prima.
