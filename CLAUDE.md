# CLAUDE.md

SubsMate gestisce gli abbonamenti condivisi del team ICPN ai servizi LLM (Claude, ChatGPT,
estendibile), sostituendo un Google Sheet manuale. Contesto e scope in `PROJECT.md`.

## Comandi

```bash
cd frontend && npm run dev      # http://localhost:3000
cd frontend && npm run build    # include il typecheck
cd frontend && npm run lint
cd frontend && npx tsc --noEmit # solo typecheck, più rapido della build
```

```bash
pip install -r execution/requirements.txt
python execution/check_db_connection.py      # diagnosi: DNS / TCP / TLS / auth
python execution/seed_services.py            # crea Claude e ChatGPT (idempotente)
python execution/seed_demo_data.py [--reset] # dati di prova, tutti e quattro gli stati
python execution/import_subs_from_sheet.py --dry-run
```

Gli script Python si lanciano dalla root: importano `execution/db.py`, che carica
`frontend/.env.local` e poi `.env`.

**Non esiste un framework di test**: la verifica è build + lint + prova manuale sui dati
demo. Non inventare comandi `npm test`.

## Architettura a tre livelli

Convenzione definita in `AGENT.md`:

- `directives/` — SOP in Markdown: cosa fare, casi limite, cose imparate. Documenti vivi:
  **aggiornale** quando scopri un vincolo o correggi un errore, ma **non crearle o
  sovrascriverle senza chiedere**.
- `execution/` — script Python deterministici. Prima di scriverne uno, controlla se esiste.
- L'orchestrazione è l'agente: legge la direttiva, sceglie lo script, gestisce gli errori,
  aggiorna la direttiva.

Quando qualcosa si rompe: correggi lo script, testalo, **poi aggiorna la direttiva**. Già
applicato a `directives/setup_ambiente.md`, va mantenuto.

## Regola centrale: nulla di calcolabile viene salvato

Quota, totale dovuto, prossima scadenza e stato pagamento **non esistono nel database**:
`frontend/lib/billing.ts` li deriva a ogni lettura da `lastPaymentDate` + `periodicity`. È
ciò che rompeva il Google Sheet — mai campi `status` o `nextDueDate` sugli schemi Mongoose.

- Filtri per stato **dopo** il calcolo, mai come query Mongo.
- `lib/billing.ts` = funzioni pure con `now` come parametro. Mantienile testabili così.
- Un `paidAt` precedente all'ultimo non fa arretrare `lastPaymentDate`: la scadenza
  tornerebbe indietro e l'abbonamento risulterebbe in falso ritardo.
- `DUE_SOON_DAYS = 15` viene dalle brand guidelines, non è arbitrario.
- `frontend/lib/queries.ts` è l'unica fonte di lettura: Server Component e route handler
  la chiamano. **Le pagine non chiamano le proprie API via HTTP.** Letture nuove vanno lì.

## Migrazione fra servizi

Passaggio di una persona da un servizio a un altro tramite un documento `Migration`, non
modificando `service`: serve pianificare in anticipo, avvisare prima della decorrenza e
ricostruire poi il conto. Spec:
`docs/superpowers/specs/2026-09-23-migrazione-abbonamento-design.md`.

- **Un ciclo pagato non si rimborsa in denaro.** Il credito nasce solo dai mesi interi
  pagati e non consumati, limitato a quanto incassato davvero: `creditMonths` × tariffa è
  il massimo teorico, non il netto.
- **`closeOld` distingue chiusura anticipata e accavallamento voluto**, non la data: con
  `a_scadenza` il vecchio resta attivo fino alla scadenza e il credito è zero per scelta.
- **Il credito è un `Payment` con `kind: "credito_migrazione"`**, non un campo: così
  `outstanding` scende via `paidForCycle` senza toccare il motore di calcolo. Quindi **va
  escluso da ogni aggregato di denaro**, o conta due volte un incasso mai avvenuto — con
  `$ne: "credito_migrazione"`, non `$eq: "incasso"`: i pagamenti anteriori al campo non lo
  hanno in documento.
- **Si spende ciclo per ciclo**, un versamento ciascuno: cambiando periodicità può valerne
  più di uno, e `paidForCycle` guarda un solo `periodEnd`.
- **Un ciclo chiuso dal credito fa avanzare `lastPaymentDate`** fino all'inizio
  dell'ultimo coperto, o un abbonamento in regola risulterebbe in ritardo.
- **Un versamento che completa un ciclo già coperto in parte resta ancorato a quel ciclo**
  e non avanza `lastPaymentDate`: spostare la scadenza scollegherebbe i versamenti
  precedenti e l'app richiederebbe soldi già incassati.
- **Nessuno scheduler**: l'app avvisa, l'admin esegue dal banner sulla scheda. La rotta di
  esecuzione rivendica la migrazione in modo atomico prima di scrivere.
- **Un abbonamento cessato sulla destinazione si riusa**, non si duplica: l'indice unico
  persona × servizio copre anche i cessati, quindi rifiutare bloccherebbe chi torna
  indietro.

## Modello dati

`Service` (tariffa mensile per persona) × `Person` → `Subscription`, più `Payment` per lo
storico e `AdminUser` per il login. Un abbonamento è una coppia persona × servizio con
indice unico; una persona può averne più di uno.

Aggiungere un servizio LLM è un documento in più, non una modifica di schema: requisito
esplicito di `PROJECT.md`, non romperlo con enum hard-coded.

## Autenticazione

Due livelli non ridondanti: `middleware.ts` gira in **Edge** e verifica solo la firma del
cookie; `requireAdmin()` / `withAdmin()` (`lib/requireAdmin.ts`) girano in **Node** e fanno
il controllo autorevole su database (admin attivo, password non cambiata dopo l'emissione
del token). Da Edge non si interroga Mongo, quindi il middleware da solo non basta.

- `lib/session-token.ts`: **solo** jose, unico modulo auth importabile dal middleware. Non
  importarci `bcryptjs`, finirebbe nel bundle Edge.
- `lib/auth.ts`: **solo** `verifyPassword()` con bcryptjs, gira in Node
  (`app/api/auth/login`), mai nel middleware.
- Header e footer in `app/(protected)/layout.tsx`, non nel root layout: `/login` è fuori
  dal gruppo protetto e non deve mostrarli.
- Ogni route sotto `app/api/` va esportata avvolta in `withAdmin()`.
- Ogni pagina sotto `app/(protected)/` deve chiamare `await requireAdmin(<percorso>)` come
  **prima istruzione della funzione**, non solo il layout: in una navigazione soft Next.js
  non riesegue il layout condiviso fra due pagine, quindi il solo controllo nel layout non
  revoca una sessione firmata ma non più autorizzata (admin disattivato, cancellato,
  password cambiata).
- Account solo con `python execution/seed_admin.py`: niente registrazione, inviti o reset
  self-service. È una scelta, spec in `docs/superpowers/specs/`.

Le due verifiche, nessuna deve stampare nulla:

```bash
grep -rLn "withAdmin" app/api --include=route.ts | grep -v auth/
grep -rL "requireAdmin" "app/(protected)" --include=page.tsx
```

## Ambiente: MongoDB Atlas

Cluster `cluster-icpn-subs`, **due database sullo stesso cluster**:

| Database | Chi lo usa | Configurato in |
| --- | --- | --- |
| `subsmate` | il sito pubblico su Vercel | variabili d'ambiente del progetto Vercel |
| `subsmate_dev` | lo sviluppo in locale | `frontend/.env.local` e `.env` di root |

Separati perché provare l'app in locale registrava pagamenti veri nei dati del sito
pubblico. `subsmate_dev` è una copia di `subsmate`, indici compresi: stesse persone,
servizi e admin con lo stesso hash, quindi stesse credenziali. **Non puntare lo sviluppo su
`subsmate`** e non allineare i due database senza chiedere: la produzione è l'unica copia
dei dati reali del team.

**Configurazione.** In `frontend/.env.local`, copiato da `.env.example`. Next.js legge i
file d'ambiente solo dalla propria directory: la `.env` di root **non viene letta** (lascia
`MONGODB_URI` indefinita) e serve solo agli script Python. Il nome del database sta in
`MONGODB_DB`, non nell'URI — nel path della connection string verrebbe ignorato
(`lib/mongodb.ts` lo passa come `dbName`). L'URI del MongoDB Community locale (servizio
Windows `MongoDB` su `127.0.0.1:27017`) resta commentata come ripiego offline.

`.env.local` è gitignorato: non sopravvive a clone o `git clean`, e senza l'app fallisce
con «AUTH_SECRET non definita». Si ricrea da `.env.example` con l'URI della `.env` di root
e `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. Un
`AUTH_SECRET` nuovo invalida le sessioni firmate: si rifà il login, credenziali invariate.

**Dev server, riavvio obbligatorio dopo**: modifiche a `.env.local` (ignorate a caldo) e a
uno schema Mongoose (il modello resta in cache e il campo nuovo viene scartato in
silenzio). Se la 3000 è occupata Next non si ferma, riparte sulla 3001 e si finisce a
interrogare il server vecchio con la configurazione vecchia — è già successo, con una
scrittura di prova finita in produzione. Su Windows `pkill` non basta: serve
`Stop-Process -Id <pid> -Force`, pid da `netstat -ano | grep ":3000.*LISTENING"`.

**Rete.** La rete ICPN bloccava la 27017 in uscita, per questo si è sviluppato a lungo in
locale; **il blocco non c'è più** (DNS SRV, TCP sui tre nodi, TLS 1.3 e SCRAM passano). Un
fallimento con TLS resettato su tutti i nodi significa che è tornato, e **non va scambiato
per un IP non autorizzato in Atlas**: `execution/check_db_connection.py` distingue i due
casi. La diagnosi sbagliata è già costata un giro a vuoto, vedi
`directives/setup_ambiente.md`.

**Credenziali e strumenti.** Credenziali Atlas in `atlas-credentials.env`, coperto dalla
regola `*.env` di `.gitignore` (`.env` da solo non basterebbe). Su questa macchina **non
sono installati né Python né i MongoDB Database Tools** (`mongorestore`, `mongoimport`):
gli script di `execution/` non sono eseguibili così come sono, e copie e restore si fanno
con il driver Node — è così che `subsmate` è stato popolato da un dump BSON ed è nato
`subsmate_dev`. Un eventuale `dump/` non va committato: contiene l'hash della password
admin.

## Deploy su Vercel

`https://subsmate.vercel.app`, con **Root Directory = `frontend`** perché l'app Next non è
nella root del repo.

Tre variabili d'ambiente, le uniche che il codice legge oltre a `NODE_ENV`: `AUTH_SECRET`,
`MONGODB_URI`, `MONGODB_DB` (in produzione `subsmate`). Sono lette al deploy: cambiarle non
basta, serve un nuovo deploy. L'`AUTH_SECRET` di Vercel è indipendente da quella locale e
**non deve coincidere**.

La allowlist di Atlas contiene `0.0.0.0/0` con commento "Vercel": le funzioni serverless
escono da IP dinamici e senza quella regola la connessione fallisce. La protezione è la
password del database, non l'IP.

Gli account si creano solo con `execution/seed_admin.py` puntando allo stesso database. Lo
script scrive `AUTH_SECRET` in `frontend/.env.local`, cioè in locale: nessun effetto su
Vercel.

## UI

Regole visive vincolanti in `brand-guidelines.md`, token in `frontend/app/globals.css`.

- **Nessun tema scuro**: il navy `#161b2d` è confinato a header, footer e bottoni primari.
  Le pagine di dati restano chiare.
- I quattro colori di stato (ok / attenzione / critico / neutro) non vanno mai riusati per
  bottoni, link o decorazione.
- Bordi sottili al posto delle ombre; ombre solo per elementi sovrapposti.
- Manrope per titoli e numeri, Inter per testo e tabelle, `tabular-nums` su tutti gli
  importi e le date.
- Tono di voce: stati espliciti («In ritardo di 8 giorni», non «Attenzione richiesta»),
  verbo all'inizio per le azioni, niente frecce decorative né maiuscolo tracciato.

Next.js 16 App Router: `params` e `searchParams` sono `Promise` e vanno attesi. Le pagine
che leggono dal database dichiarano `export const dynamic = "force-dynamic"`.

## Convenzioni

- Interfaccia, commenti, direttive e messaggi di errore **in italiano**, con accenti
  corretti. Identificatori di codice in inglese.
- Il repo usa un'identità git locale (`yintong-zhou <zhouyintong96@gmail.com>`) diversa
  dalla globale: non sovrascriverla, non committare con `--global`.
- I file intermedi vanno in `.tmp/`, mai committati.
