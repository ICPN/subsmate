# SubsMate ICPN

Webapp per gestire gli abbonamenti team condivisi ai servizi LLM (Claude, ChatGPT,
estendibile ad altri), in sostituzione dell'attuale Google Sheet. Calcola automaticamente
quote, scadenze e stato dei pagamenti, e conserva lo storico completo.

Contesto e scope: [PROJECT.md](PROJECT.md) · Convenzioni di lavoro: [AGENT.md](AGENT.md)

## Stack

- **Frontend + API**: Next.js 16 (App Router) + React 19 + Tailwind CSS 4 + TypeScript
- **Database**: MongoDB (Atlas piano free) via Mongoose
- **Script utility**: Python 3 + pymongo
- **Hosting**: Vercel + MongoDB Atlas

## Struttura

```
subsmate/
├── frontend/              # App Next.js (UI + API routes)
│   ├── app/
│   │   ├── api/           # Route handler REST
│   │   ├── abbonamenti/   # elenco con filtri + scheda con storico
│   │   ├── persone/ servizi/ pagamenti/
│   │   ├── layout.tsx     # header/footer navy, font Manrope + Inter
│   │   └── page.tsx       # dashboard
│   ├── lib/
│   │   ├── mongodb.ts     # connessione con cache globale
│   │   ├── billing.ts     # motore di calcolo (quote, scadenze, stato)
│   │   ├── queries.ts     # letture condivise API/pagine
│   │   ├── validation.ts  # schemi Zod di input
│   │   └── api.ts         # risposte e gestione errori uniformi
│   ├── components/        # primitive UI (card, tabella, badge di stato)
│   └── models/            # schemi Mongoose
├── directives/            # SOP in Markdown (livello 1)
├── execution/             # script Python deterministici (livello 3)
├── .tmp/                  # file intermedi, mai committati
└── .env.example
```

## Modello dati

| Collezione | Contenuto |
| --- | --- |
| `services` | Servizio LLM: nome, tariffa mensile, giorno di addebito |
| `people` | Persone del team (email univoca) |
| `subscriptions` | Istanza persona × servizio: periodicità, supplemento donazione, stato onboarding, `lastPaymentDate` |
| `payments` | Storico incassi: importo, quota donazione, data, metodo, periodo coperto |
| `adminusers` | Admin dell'app (email + password hashata) |

**Principio chiave:** quota, totale dovuto, prossima scadenza e stato pagamento **non**
sono salvati. Sono derivati a ogni lettura da `lib/billing.ts` a partire da
`lastPaymentDate` + periodicità, così non possono andare fuori sincrono.

Stati calcolati: `in_regola` · `in_scadenza` (entro 15 giorni) · `in_ritardo` · `da_attivare`.

## Design

La UI segue [brand-guidelines.md](brand-guidelines.md): navy `#161b2d` confinato a header,
footer e bottoni primari; pagine di dati su sfondo chiaro; bordi sottili al posto delle ombre;
Manrope per titoli e numeri, Inter per tabelle e dati; i quattro colori di stato non sono
riusati per nient'altro. I token vivono in `frontend/app/globals.css`.

## API

| Metodo | Endpoint | Descrizione |
| --- | --- | --- |
| GET / POST | `/api/services` | Elenco e creazione servizi |
| GET / PATCH / DELETE | `/api/services/:id` | Dettaglio servizio |
| GET / POST | `/api/people` | Elenco (con `?q=`) e creazione persone |
| GET / PATCH / DELETE | `/api/people/:id` | Scheda persona con abbonamenti e totale dovuto |
| GET / POST | `/api/subscriptions` | Elenco con calcoli (`?status=`, `?person=`, `?service=`) |
| GET / PATCH / DELETE | `/api/subscriptions/:id` | Dettaglio con storico pagamenti |
| GET / POST | `/api/subscriptions/:id/payments` | Storico e registrazione pagamento |
| GET | `/api/payments` | Storico globale (`?person=`, `?from=`, `?to=`) |
| GET | `/api/dashboard` | Totali, contatori di stato, abbonamenti da seguire |

## Avvio rapido

```bash
cp .env.example frontend/.env.local   # valorizza MONGODB_URI
cd frontend && npm install && npm run dev
```

```bash
pip install -r execution/requirements.txt
python execution/check_db_connection.py   # diagnosi: DNS / TCP / TLS / autenticazione
python execution/seed_services.py         # crea Claude e ChatGPT
python execution/seed_demo_data.py        # dati di prova per verificare la UI
```

> **Nota rete:** la porta 27017 è bloccata in uscita sulla rete ICPN, quindi MongoDB Atlas
> non è raggiungibile dalle postazioni interne. Lo sviluppo avviene su MongoDB Community
> locale; `frontend/.env.local` contiene entrambe le URI, con quella Atlas commentata.
> Dettagli in [directives/setup_ambiente.md](directives/setup_ambiente.md).

Procedura completa in [directives/setup_ambiente.md](directives/setup_ambiente.md).

## Stato

- [x] Modelli dati e motore di calcolo
- [x] API REST complete (servizi, persone, abbonamenti, pagamenti, dashboard)
- [x] Direttive e script di import
- [x] UI — dashboard, abbonamenti (con filtri), scheda abbonamento con registrazione pagamento, persone, servizi, pagamenti
- [x] Verifica end-to-end su MongoDB locale: registrazione pagamento, ricalcolo di scadenza e stato
- [ ] Autenticazione admin (modello `AdminUser` pronto, flusso di login da implementare)
- [ ] Import reale dal Google Sheet
- [ ] Connessione ad Atlas (bloccata dalla rete, non dal codice)
