# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

SubsMate gestisce gli abbonamenti condivisi del team ICPN ai servizi LLM (Claude, ChatGPT,
estendibile), sostituendo un Google Sheet manuale. Contesto e scope in `PROJECT.md`.

## Comandi

```bash
cd frontend && npm run dev      # http://localhost:3000
cd frontend && npm run build    # include il typecheck TypeScript
cd frontend && npm run lint
cd frontend && npx tsc --noEmit # solo typecheck, più rapido della build
```

```bash
pip install -r execution/requirements.txt
python execution/check_db_connection.py      # diagnosi connessione: DNS / TCP / TLS / auth
python execution/seed_services.py            # crea Claude e ChatGPT (idempotente)
python execution/seed_demo_data.py [--reset] # dati di prova, tutti e quattro gli stati
python execution/import_subs_from_sheet.py --dry-run
```

Gli script Python vanno lanciati dalla root (importano `execution/db.py`, che carica
`frontend/.env.local` e poi `.env`).

**Non esiste un framework di test.** La verifica si fa con build + lint + prova manuale
sull'app con i dati demo. Non inventare comandi `npm test`.

## Architettura a tre livelli

Convenzione del repo, definita in `AGENT.md` e da rispettare:

- `directives/` — SOP in Markdown: cosa fare, casi limite, cose imparate. Sono documenti
  vivi: vanno **aggiornate** quando si scopre un vincolo o si corregge un errore, ma **non
  create o sovrascritte senza chiedere**.
- `execution/` — script Python deterministici. Prima di scriverne uno nuovo, controlla se
  esiste già.
- Il livello di orchestrazione è l'agente: legge la direttiva, sceglie lo script, gestisce
  gli errori, aggiorna la direttiva.

Quando qualcosa si rompe: correggi lo script, testalo, **poi aggiorna la direttiva** con
ciò che hai imparato. Questo loop è già stato applicato a
`directives/setup_ambiente.md` e va mantenuto.

## Regola architetturale centrale: nulla di calcolabile viene salvato

Quota, totale dovuto, prossima scadenza e stato pagamento **non esistono nel database**.
Sono derivati a ogni lettura da `frontend/lib/billing.ts` a partire da `lastPaymentDate` +
`periodicity`. È ciò che rompeva il Google Sheet: non aggiungere campi `status` o
`nextDueDate` agli schemi Mongoose.

Conseguenze pratiche:

- I filtri per stato si applicano **dopo** il calcolo, mai come query Mongo.
- `lib/billing.ts` contiene funzioni pure, con `now` sempre passato come parametro:
  mantienile testabili così.
- Registrare un pagamento con `paidAt` precedente all'ultimo non fa arretrare
  `lastPaymentDate` — altrimenti la scadenza tornerebbe indietro e l'abbonamento
  risulterebbe falsamente in ritardo.
- `DUE_SOON_DAYS = 15` viene dalle brand guidelines, non è un numero arbitrario.

`frontend/lib/queries.ts` è l'unica fonte di lettura: le Server Component la chiamano
direttamente, le route handler la riusano. **Le pagine non chiamano le proprie API via
HTTP.** Se aggiungi una lettura, mettila lì invece di duplicarla.

## Modello dati

`Service` (tariffa mensile per persona) × `Person` → `Subscription`, più `Payment` per lo
storico e `AdminUser` per il login. Un abbonamento è una coppia persona × servizio, con
indice unico: una persona può averne più di uno contemporaneamente.

Aggiungere un servizio LLM è un documento in più, non una modifica di schema — è un
requisito esplicito di `PROJECT.md`, non romperlo con enum hard-coded.

## Ambiente: MongoDB Atlas non è raggiungibile

La rete ICPN blocca la porta 27017 in uscita, verso qualsiasi host. Lo sviluppo avviene su
MongoDB Community locale (servizio Windows `MongoDB` su `127.0.0.1:27017`).
`frontend/.env.local` contiene entrambe le URI, con quella Atlas commentata.

Se una connessione fallisce con TLS resettato su tutti i nodi, **non concludere che sia
l'IP non autorizzato in Atlas**: lancia `execution/check_db_connection.py`, che distingue
il blocco di rete dal rifiuto di Atlas. La diagnosi sbagliata è già costata un giro a
vuoto ed è documentata in `directives/setup_ambiente.md`.

Le credenziali Atlas stanno in `atlas-credentials.env`, coperto dalla regola `*.env` in
`.gitignore` (`.env` da solo non lo intercetterebbe).

## UI

Le regole visive stanno in `brand-guidelines.md` e sono vincolanti; i token in
`frontend/app/globals.css`.

- **Nessun tema scuro**: il navy `#161b2d` è confinato a header, footer e bottoni primari.
  Le pagine di dati restano chiare.
- I quattro colori di stato (ok / attenzione / critico / neutro) non vanno mai riusati per
  bottoni, link o decorazione.
- Bordi sottili al posto delle ombre; ombre solo per elementi sovrapposti.
- Manrope per titoli e numeri, Inter per testo e tabelle, `tabular-nums` su tutti gli
  importi e le date.
- Tono di voce: stati espliciti ("In ritardo di 8 giorni", non "Attenzione richiesta"),
  verbo all'inizio per le azioni, niente frecce decorative né maiuscolo tracciato.

Next.js 16 App Router: `params` e `searchParams` sono `Promise` e vanno attesi. Le pagine
che leggono dal database dichiarano `export const dynamic = "force-dynamic"`.

## Convenzioni

- Interfaccia, commenti, direttive e messaggi di errore sono **in italiano**, con accenti
  corretti. Gli identificatori di codice restano in inglese.
- Il repo usa un'identità git locale (`yintong-zhou <zhouyintong96@gmail.com>`) diversa da
  quella globale: non sovrascriverla e non committare con `--global`.
- I file intermedi vanno in `.tmp/`, mai committati.
