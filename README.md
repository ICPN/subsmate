# SubsMate ICPN

Webapp per gestire gli abbonamenti condivisi del team ICPN ai servizi LLM (Claude, ChatGPT,
estendibile ad altri), al posto del Google Sheet manuale. Calcola quote, scadenze e stato dei
pagamenti, conserva lo storico completo e guida gli admin nei casi difficili: pagamenti
parziali, passaggi da un servizio all'altro, primo mese addebitato in proporzione.

**In produzione:** <https://subsmate.vercel.app> · Contesto e scope: [PROJECT.md](PROJECT.md)

## Cosa fa

- **Abbonamenti persona × servizio.** Una persona può averne più di uno (Claude e ChatGPT),
  ognuno mensile o trimestrale, con un supplemento donazione facoltativo.
- **Scadenze e stati calcolati.** In regola, in scadenza (entro 15 giorni), in ritardo, da
  attivare, cessato. La dashboard mostra chi sollecitare e quanto è dovuto nel ciclo.
- **Pagamenti completi, parziali o arretrati,** con storico consultabile, correzione ed
  eliminazione.
- **Migrazioni fra servizi** pianificate in anticipo: i mesi pagati e non goduti diventano
  credito sul nuovo servizio, e l'esecuzione resta all'admin.
- **Credito del primo mese.** Quando il fornitore addebita solo i giorni fino al rinnovo
  (ChatGPT), la differenza diventa un credito della persona, usabile su qualunque suo
  abbonamento.
- **Accesso riservato agli admin,** con profilo per cambiare email e password, e una
  **guida per compito** dentro l'app (`/guida`).

> [!NOTE]
> Quota, totale dovuto, scadenza e stato **non sono salvati nel database**: `lib/billing.ts`
> li ricalcola a ogni lettura dai pagamenti registrati. È ciò che rompeva il Google Sheet.
> Se un valore è sbagliato si corregge il pagamento, non lo stato.

## Stack

| Livello | Tecnologia |
| --- | --- |
| App e API | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 |
| Validazione e auth | Zod 4, jose (JWT), bcryptjs |
| Database | MongoDB Atlas via Mongoose, con transazioni sulle scritture contabili |
| Script | Python 3 + pymongo (`execution/`) |
| Hosting | Vercel + MongoDB Atlas |

## Avvio rapido

Servono Node.js 20 o superiore e l'accesso al cluster Atlas `cluster-icpn-subs`.

```bash
cp .env.example frontend/.env.local   # MONGODB_URI, MONGODB_DB="subsmate_dev", AUTH_SECRET
cd frontend
npm install
npm run dev                           # http://localhost:3000
```

`AUTH_SECRET` si genera con:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

> [!WARNING]
> In locale usa sempre il database **`subsmate_dev`**, mai `subsmate`: quello è la produzione
> e l'unica copia dei dati reali del team. Il nome del database va in `MONGODB_DB`, non
> nell'URI.

Next.js legge solo `frontend/.env.local`; la `.env` di root serve agli script Python. Dopo una
modifica a `.env.local` o a uno schema Mongoose il dev server va riavviato.

### Script di supporto

Si lanciano dalla root del repository:

```bash
pip install -r execution/requirements.txt
python execution/check_db_connection.py      # diagnosi: DNS / TCP / TLS / autenticazione
python execution/seed_services.py            # crea Claude e ChatGPT (idempotente)
python execution/seed_demo_data.py [--reset] # dati di prova in tutti gli stati
python execution/seed_admin.py --email "tua@email.it" --name "Nome Cognome"
```

Gli account admin si creano **solo** con `seed_admin.py`: l'app non ha registrazione né
recupero password. La password si inserisce a schermo, mai come argomento.

## Ambienti

Un solo cluster Atlas, due database:

| Database | Usato da | Configurato in |
| --- | --- | --- |
| `subsmate` | il sito su Vercel | variabili d'ambiente del progetto Vercel |
| `subsmate_dev` | lo sviluppo in locale | `frontend/.env.local` e `.env` di root |

`subsmate_dev` è una copia della produzione, con le stesse persone e gli stessi admin.

> [!NOTE]
> Le transazioni richiedono un replica set: funzionano su Atlas ma non sul MongoDB Community
> locale standalone, che resta solo come ripiego offline.

## Deploy

Il progetto Vercel ha **Root Directory = `frontend`**. Il codice legge tre variabili
d'ambiente oltre a `NODE_ENV`:

| Variabile | Produzione |
| --- | --- |
| `MONGODB_URI` | URI del cluster Atlas |
| `MONGODB_DB` | `subsmate` |
| `AUTH_SECRET` | segreto proprio, diverso da quello locale |

Le variabili si leggono al deploy: dopo averle cambiate serve un nuovo deploy. La allowlist di
Atlas accetta `0.0.0.0/0` perché le funzioni Vercel escono da IP dinamici.

## Verifica

Il progetto non ha un framework di test. Prima di ogni commit:

```bash
cd frontend
npx tsc --noEmit
npm run lint
npm run build
grep -rLn "withAdmin" app/api --include=route.ts | grep -v auth/       # non deve stampare nulla
grep -rL "requireAdmin" "app/(protected)" --include=page.tsx           # non deve stampare nulla
```

Poi una prova manuale su `subsmate_dev`, con dati di prova riconoscibili da cancellare alla
fine.

## Struttura

```
subsmate/
├── frontend/
│   ├── app/
│   │   ├── (protected)/   # dashboard, abbonamenti, persone, servizi, pagamenti, profilo, guida
│   │   ├── api/           # route handler, tutti avvolti in withAdmin()
│   │   └── login/         # unica pagina fuori dal gruppo protetto
│   ├── lib/
│   │   ├── billing.ts     # motore di calcolo: funzioni pure, `now` come parametro
│   │   ├── migration.ts   # saldo e avvisi delle migrazioni
│   │   ├── queries.ts     # unica fonte di lettura per pagine e API
│   │   └── …              # auth, sessione, validazione, ricerca, ordinamento
│   ├── models/            # schemi Mongoose
│   └── middleware.ts      # Edge: verifica solo la firma del cookie
├── directives/            # procedure operative (SOP) in Markdown
├── execution/             # script Python deterministici
└── docs/                  # spec, piani, handoff, audit
```

## API

Tutte le rotte, tranne login e logout, richiedono una sessione admin.

| Metodo | Endpoint | Descrizione |
| --- | --- | --- |
| POST | `/api/auth/login`, `/api/auth/logout` | Accesso e uscita |
| PATCH | `/api/account` | Cambio email o password dell'admin collegato |
| GET / POST | `/api/services` | Elenco e creazione servizi |
| GET / PATCH / DELETE | `/api/services/:id` | Dettaglio servizio |
| GET / POST | `/api/people` | Elenco (con `?q=`) e creazione persone |
| GET / PATCH / DELETE | `/api/people/:id` | Scheda persona con abbonamenti e totale dovuto |
| GET / POST | `/api/subscriptions` | Elenco con calcoli (`?status=`, `?person=`, `?service=`) |
| GET / PATCH / DELETE | `/api/subscriptions/:id` | Dettaglio con storico pagamenti |
| GET / POST | `/api/subscriptions/:id/payments` | Storico e registrazione pagamento |
| PATCH / DELETE | `/api/subscriptions/:id/payments/:paymentId` | Correzione ed eliminazione di un pagamento |
| POST | `/api/subscriptions/:id/migration` | Pianificazione di una migrazione |
| PATCH / DELETE | `/api/migrations/:id` | Modifica o annullamento di una migrazione pianificata |
| POST | `/api/migrations/:id/execute` | Esecuzione della migrazione |
| GET | `/api/payments` | Storico globale (`?person=`, `?from=`, `?to=`) |
| GET | `/api/dashboard` | Totali, contatori di stato, abbonamenti da seguire |

## Documentazione

| Documento | Contenuto |
| --- | --- |
| Guida in-app (`/guida`) | Come usare l'app, un compito alla volta |
| [CLAUDE.md](CLAUDE.md) | Regole di sviluppo, vincoli di calcolo, ambiente e deploy |
| [AGENT.md](AGENT.md) | Architettura a tre livelli: direttive, orchestrazione, script |
| [brand-guidelines.md](brand-guidelines.md) | Regole visive e tono di voce dell'interfaccia |
| [directives/](directives/) | Procedure operative: ambiente, admin, abbonamenti, pagamenti, import |
| [docs/superpowers/specs/](docs/superpowers/specs/) | Spec di progetto (autenticazione, CRUD, migrazione, pagamenti) |
| [docs/audit/](docs/audit/) | Revisioni di bug e sicurezza |
