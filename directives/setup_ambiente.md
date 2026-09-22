# Direttiva: Setup ambiente

## Obiettivo
Rendere eseguibile SubsMate in locale: dipendenze Node, variabili d'ambiente, connessione a MongoDB.

## Input
- `atlas-credentials.env` in root, generato dall'onboarding di Atlas (utente, password, URI).
  Il file contiene la password in chiaro: è coperto dalla regola `*.env` in `.gitignore`
  e non va mai committato né incollato in chat.

## Procedura
1. Derivare `frontend/.env.local` e `.env` da `atlas-credentials.env`: `MONGODB_URI` va copiata
   così com'è, `MONGODB_DB="subsmate"` va aggiunta a parte (l'URI di Atlas non contiene il nome
   del database). Next.js legge le variabili solo da dentro `frontend/`; la copia in root serve
   agli script Python.
2. Installare le dipendenze: `npm install` dentro `frontend/`.
3. Avviare: `npm run dev` (http://localhost:3000).
4. Verificare la connessione con `python execution/check_db_connection.py`: separa DNS, TCP,
   TLS e autenticazione e dice quale strato ha ceduto. In alternativa `GET /api/services`,
   che però restituisce solo un 500 generico.
5. Popolare i servizi di base: `python execution/seed_services.py`.
6. Per verificare l'interfaccia senza dati reali: `python execution/seed_demo_data.py`.
   Crea sei abbonamenti che coprono tutti e quattro gli stati calcolati. Le persone demo
   hanno email `@example.test` e `--reset` rimuove solo quelle, lasciando intatti i dati veri.

## Ambiente di sviluppo su questa rete (aggiornato 22/09/2026)

La rete ICPN blocca la porta 27017 in uscita, quindi **Atlas non è raggiungibile dalle
postazioni interne**. Si sviluppa su MongoDB Community installato in locale:

- Servizio Windows `MongoDB` (verifica: `Get-Service MongoDB`), in ascolto su `127.0.0.1:27017`.
- `frontend/.env.local` contiene entrambe le URI, quella locale attiva e quella Atlas
  commentata: per passare ad Atlas si scambiano le due righe, da una rete che lasci uscire
  la 27017. Le credenziali Atlas restano in `atlas-credentials.env` (mai committato).
- Il database locale è vuoto a ogni installazione: i dati di prova si ricreano con gli script,
  non si trasportano a mano.

## Output
- App raggiungibile in locale, collezione `services` popolata.

## Casi limite e note apprese
- **`MONGODB_URI non definita`**: la variabile è in `.env` di root ma non in `frontend/.env.local`.
  Next.js non risale le directory: serve il file dentro `frontend/`.
- **`SSLHandshakeFailed` / `WinError 10054` su tutti i nodi (verificato 22/09/2026)**:
  DNS e TCP passano, ma l'handshake TLS viene chiuso senza alert. **Due cause diverse
  producono lo stesso sintomo** e vanno distinte prima di intervenire:
  1. **Porta 27017 bloccata in uscita dalla rete locale.** È il caso riscontrato sulla rete
     ICPN: le porte 80/443/8080 passano, la 27017 viene resettata anche verso un host
     pubblico senza whitelist (`portquiz.net`). Nessuna modifica su Atlas può risolverlo.
     Rimedi: sblocco della porta in uscita, hotspot mobile, VPN, o MongoDB locale.
  2. **IP pubblico non autorizzato in Atlas** → Security → Network Access. Solo se la
     porta 27017 esce regolarmente. L'IP si legge con `curl https://api.ipify.org`;
     su molte connessioni è dinamico e va riaggiunto.

  `execution/check_db_connection.py` distingue automaticamente i due casi: non fermarsi
  al messaggio "TLS fallito" e non modificare Atlas prima di aver letto il verdetto.
  Nota: l'IP di uscita su 443 può differire da quello su altre porte dietro proxy aziendale,
  quindi l'IP restituito da ipify non è necessariamente quello che Atlas vede.
- **`check_db_connection.py` dà un falso "PORTA 27017 BLOCCATA" anche con `MONGODB_URI` locale
  (verificato 22/09/2026).** Lo script è pensato per Atlas e tenta sempre l'handshake TLS,
  indipendentemente dall'host: contro `mongodb://127.0.0.1:27017` (MongoDB Community locale,
  senza TLS) il passo 3 fallisce sempre, e la sonda su `portquiz.net` che segue non ha alcun
  rapporto con la raggiungibilità del Mongo locale. Se `MONGODB_URI` punta a `127.0.0.1` e il
  servizio Windows `MongoDB` risulta `Running` (`Get-Service MongoDB`), non fidarsi del verdetto
  dello script: verificare con una query diretta, es.
  `python -c "from execution.db import get_db; print(get_db().list_collection_names())"`.
- **Errore di autenticazione dopo che il TLS passa**: utente o password sbagliati, oppure
  all'utente del database non è stato dato il ruolo di lettura/scrittura su `subsmate`.
- **Piano free in pausa**: dopo inattività prolungata il cluster si sospende e la prima
  richiesta può impiegare ~30 secondi.
- La connessione usa una cache globale (`lib/mongodb.ts`): in dev l'HMR ricarica i moduli e
  senza cache si esaurirebbe il pool di connessioni del piano free.
