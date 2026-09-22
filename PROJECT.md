# SubsMate ICPN

## Idea in breve
Webapp per gestire gli abbonamenti team condivisi a servizi LLM (Claude, ChatGPT, estendibile ad altri), sostituendo l'attuale gestione su Google Sheet, con calcolo automatico di quote, scadenze, stato pagamento e storico completo dei pagamenti.

## Problema e opportunità
Oggi la gestione avviene su un Google Sheet manuale: le scadenze dei diversi servizi non sono allineate tra loro, le persone con più abbonamenti (es. sia Claude che ChatGPT) sono difficili da tracciare in modo pulito, non esiste alcun automatismo per calcolare quote, prossime scadenze o stato dei pagamenti, e il rischio di errori o dimenticanze nei solleciti è alto man mano che il numero di persone e servizi cresce.

## Obiettivo e target
Dare a Tong e agli altri admin uno strumento centralizzato per gestire abbonamenti multipli per persona (persona × servizio), con calcolo automatico di quote e scadenze e uno storico completo dei pagamenti. Target: gli admin del team (Tong + collaboratori) — non è previsto accesso self-service per i singoli membri del team in questa fase.

## Scope

**Dentro:**
- Gestione abbonamenti come istanze persona × servizio (una persona può avere più abbonamenti attivi contemporaneamente, es. Claude + ChatGPT)
- Calcolo automatico della quota servizio, basato su tariffa mensile/trimestrale configurabile per servizio
- Supplemento donazione opzionale per abbonamento, sommato alla quota nel totale dovuto
- Calcolo automatico della prossima scadenza (data ultimo pagamento + periodicità)
- Stato pagamento calcolato automaticamente: in regola / in scadenza / in ritardo / da attivare
- Storico dei pagamenti per ogni abbonamento
- Dashboard con vista d'insieme: totale dovuto nel periodo corrente, abbonamenti in ritardo/in scadenza, totale donazioni raccolte
- Importazione una tantum dei dati esistenti dal Google Sheet ("Application AI Team Plan")
- Login email+password per gli admin
- Architettura pensata per aggiungere facilmente nuovi servizi in futuro (LLM3, LLM4...) senza modificare lo schema dati

**Fuori (per ora):**
- Notifiche/solleciti automatici (es. email) — da valutare in una fase successiva
- Accesso self-service per i singoli membri del team
- Integrazione diretta con sistemi di pagamento (la raccolta soldi resta manuale, l'app traccia solo lo stato)

## Funzionalità / requisiti principali
- CRUD Servizi (nome, tariffa mensile, giorno di addebito piattaforma)
- CRUD Persone (nome, cognome, email)
- CRUD Abbonamenti (persona, servizio, periodicità, supplemento donazione, stato onboarding)
- Motore di calcolo: quota servizio, totale dovuto, prossima scadenza, stato pagamento
- Registrazione pagamento (aggiorna data ultimo pagamento e aggiunge una riga allo storico)
- Storico pagamenti consultabile per singolo abbonamento e vista aggregata per persona (totale dovuto su tutti i suoi servizi)
- Dashboard riepilogativa con i totali e gli abbonamenti da seguire
- Import dati iniziale dal Google Sheet esistente
- Autenticazione admin (email + password)

## Risorse necessarie
- **Stack tecnico:** React (frontend) + Node.js (backend/API) + MongoDB (database)
- **Hosting:** Vercel (frontend + backend) e MongoDB Atlas, entrambi su piano free
- **Persone:** Tong + altri collaboratori/admin
- **Dati di partenza:** Google Sheet esistente "Application AI Team Plan (Responses)", tab Subs