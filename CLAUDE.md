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

## Migrazione fra servizi

Un abbonamento si sposta da un servizio a un altro (stessa persona) con un documento
`Migration`, non modificando il campo `service`: serve poter pianificare in anticipo,
mostrare l'avviso prima della decorrenza e ricostruire in seguito come è stato fatto il
conto. La spec sta in `docs/superpowers/specs/2026-09-23-migrazione-abbonamento-design.md`.

Regole che non vanno riscoperte a caso:

- **Un ciclo già pagato non si rimborsa in denaro.** Il credito nasce solo dai mesi interi
  pagati e non consumati, ed è limitato a quanto era stato davvero incassato: vedere
  `creditMonths` × tariffa come importo è il massimo teorico, non il netto.
- **`closeOld` distingue la chiusura anticipata dall'accavallamento voluto**, non la data:
  con `a_scadenza` il vecchio abbonamento resta attivo fino alla sua scadenza e il credito
  è zero per scelta, non per calcolo.
- **Il credito è un `Payment` con `kind: "credito_migrazione"`**, non un campo sul nuovo
  abbonamento: così `outstanding` scende attraverso `paidForCycle` senza toccare il motore
  di calcolo. Conseguenza da ricordare ogni volta che si aggiunge un aggregato di denaro:
  **va escluso**, altrimenti si conta due volte un incasso che non c'è mai stato. Usare
  `$ne: "credito_migrazione"` e non `$eq: "incasso"`, perché i pagamenti scritti prima che
  il campo esistesse non lo hanno in documento.
- **Un versamento che completa un ciclo già coperto in parte resta ancorato a quel ciclo**
  e non fa avanzare `lastPaymentDate`. `paidForCycle` riconosce un pagamento confrontando
  `periodEnd` con la scadenza corrente: far avanzare la scadenza scollegherebbe i
  versamenti precedenti e l'app richiederebbe soldi già incassati.
- **Non esiste uno scheduler.** L'app avvisa, l'admin esegue dal banner sulla scheda. La
  rotta di esecuzione rivendica la migrazione in modo atomico prima di scrivere.
- **Un abbonamento cessato sul servizio di destinazione viene riusato**, non duplicato:
  l'indice unico persona × servizio copre anche i cessati, quindi crearne un secondo è
  impossibile e rifiutare bloccherebbe per sempre chi torna indietro.

## Modello dati

`Service` (tariffa mensile per persona) × `Person` → `Subscription`, più `Payment` per lo
storico e `AdminUser` per il login. Un abbonamento è una coppia persona × servizio, con
indice unico: una persona può averne più di uno contemporaneamente.

Aggiungere un servizio LLM è un documento in più, non una modifica di schema — è un
requisito esplicito di `PROJECT.md`, non romperlo con enum hard-coded.

## Autenticazione

Due livelli, non ridondanti: `middleware.ts` gira in **Edge** e verifica solo la firma del
cookie; `requireAdmin()` / `withAdmin()` (in `lib/requireAdmin.ts`) girano in **Node** e
fanno il controllo autorevole su database (admin attivo, password non cambiata dopo
l'emissione del token). Il middleware non può interrogare Mongo da Edge, quindi non è
sufficiente da solo.

- `lib/session-token.ts` contiene **solo** jose (firma/verifica JWT) ed è l'unico modulo
  auth importabile dal middleware. Non importarci `bcryptjs`: finirebbe nel bundle Edge.
- `lib/auth.ts` contiene **solo** `verifyPassword()` con bcryptjs: gira in Node (route
  `app/api/auth/login`), mai nel middleware.
- Header e footer stanno in `app/(protected)/layout.tsx`, non nel root layout: la pagina
  `/login` (fuori dal gruppo protetto) non li mostra.
- Ogni nuova route sotto `app/api/` va esportata avvolta in `withAdmin()`. Verifica con:
  `grep -rLn "withAdmin" app/api --include=route.ts | grep -v auth/` — non deve stampare nulla.
- Ogni pagina sotto `app/(protected)/` deve chiamare `await requireAdmin(<percorso>)` come
  prima istruzione della funzione, non solo il layout: durante una navigazione soft (partial
  rendering) Next.js **non riesegue** il layout del route group condiviso fra due pagine, quindi
  il solo controllo in `app/(protected)/layout.tsx` non basta a revocare una sessione firmata
  ma non più autorizzata (admin disattivato, cancellato, password cambiata). Verifica con:
  `grep -rL "requireAdmin" "app/(protected)" --include=page.tsx` — non deve stampare nulla.
- Gli account si creano solo con `python execution/seed_admin.py`. Non esistono registrazione,
  inviti o reset self-service, ed è una scelta: vedi la spec in `docs/superpowers/specs/`.

## Ambiente: il database è MongoDB Atlas

Il cluster è `cluster-icpn-subs` e ospita **due database sullo stesso cluster**:

| Database | Chi lo usa | Dove è configurato |
| --- | --- | --- |
| `subsmate` | il sito pubblico su Vercel | variabili d'ambiente del progetto Vercel |
| `subsmate_dev` | lo sviluppo in locale | `frontend/.env.local` e `.env` di root |

Sono separati perché provare l'app in locale registrava pagamenti veri nei dati che vede
il sito pubblico. `subsmate_dev` nasce come copia di `subsmate`, indici compresi: stesse
persone, stessi servizi, stesso admin con lo stesso hash, quindi si entra con le medesime
credenziali. **Non puntare lo sviluppo su `subsmate`** e non allineare i due database
senza chiedere: la produzione è l'unica copia dei dati reali del team.

La configurazione dell'app sta in **`frontend/.env.local`**, da creare copiando
`.env.example`: Next.js carica i file d'ambiente solo dalla propria directory di progetto,
quindi una `.env` nella root **non viene letta** e lascia `MONGODB_URI` indefinita. La
`.env` di root serve solo agli script Python di `execution/`, che caricano prima
`frontend/.env.local` e poi lei.

`frontend/.env.local` contiene l'URI Atlas attiva; quella del MongoDB Community locale
(servizio Windows `MongoDB` su `127.0.0.1:27017`) resta commentata come ripiego offline.
Il nome del database sta in `MONGODB_DB`, non nell'URI: non aggiungerlo al path della
stringa di connessione, verrebbe ignorato (`lib/mongodb.ts` lo passa come `dbName`).

`frontend/.env.local` è coperto da `.gitignore`, quindi non sopravvive a un clone o a un
`git clean`: senza di lui l'app parte e fallisce con «AUTH_SECRET non definita». Si
ricrea copiando `.env.example`, riportando l'URI dalla `.env` di root e generando il
segreto con
`node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.
Un `AUTH_SECRET` nuovo invalida le sessioni già firmate: si rifà il login, le credenziali
non cambiano.

Cambiare `.env.local` **non ha effetto su un dev server già avviato**, va riavviato. Se la
porta 3000 è occupata Next non si ferma: riparte sulla 3001 e si finisce a interrogare il
server vecchio, con la configurazione vecchia — è già successo, e una scrittura di prova è
finita in produzione. Su Windows `pkill` non chiude il processo: serve
`Stop-Process -Id <pid> -Force`, con il pid da `netstat -ano | grep ":3000.*LISTENING"`.

La rete ICPN bloccava la porta 27017 in uscita e per questo si è sviluppato a lungo in
locale. **Il blocco non c'è più**: DNS SRV, TCP 27017 sui tre nodi, TLS 1.3 e
autenticazione SCRAM passano. Se una connessione fallisce con TLS resettato su tutti i
nodi il blocco è tornato, e **non va scambiato per un IP non autorizzato in Atlas**:
lancia `execution/check_db_connection.py`, che distingue i due casi. La diagnosi sbagliata
è già costata un giro a vuoto ed è documentata in `directives/setup_ambiente.md`.

Le credenziali Atlas stanno in `atlas-credentials.env`, coperto dalla regola `*.env` in
`.gitignore` (`.env` da solo non lo intercetterebbe).

Su questa macchina **non sono installati né Python né i MongoDB Database Tools**
(`mongorestore`, `mongoimport`): gli script in `execution/` non sono eseguibili così com'è.
Copie e restore si fanno con il driver Node — è così che `subsmate` è stato popolato da un
dump BSON ed è nato `subsmate_dev`. Un eventuale `dump/` non va committato: contiene
l'hash della password admin.

## Deploy su Vercel

Il sito sta su `https://subsmate.vercel.app`. Il progetto Vercel ha **Root Directory =
`frontend`**, perché l'app Next non è nella root del repo.

Tre variabili d'ambiente, le uniche che il codice legge oltre a `NODE_ENV`:
`AUTH_SECRET`, `MONGODB_URI` e `MONGODB_DB` (in produzione vale `subsmate`). Sono lette
al deploy: dopo averle cambiate serve un nuovo deploy, non basta salvarle. L'`AUTH_SECRET`
di Vercel è indipendente da quella locale e **non deve coincidere**.

La allowlist di Atlas contiene `0.0.0.0/0` con commento "Vercel": le funzioni serverless
escono da IP dinamici e senza quella regola la connessione fallisce. La protezione è la
password del database, non l'IP.

Non esiste registrazione: gli account si creano solo con `execution/seed_admin.py`
puntando allo stesso database. Lo script scrive `AUTH_SECRET` in `frontend/.env.local`,
cioè in locale: non ha alcun effetto su Vercel.

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
