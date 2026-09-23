---
type: handoff
date: 2026-09-23
status: in corso
seq: 1
prev: docs/handoff/2026-09-23-crud-gestione.md
tags: [deploy, vercel, atlas, billing, scadenze, pagamenti, ui, ordinamento]
---

## Obiettivo

Sostituire il Google Sheet manuale del team ICPN con SubsMate, ora **in produzione su
Vercel** (`https://subsmate.vercel.app`). In questa sessione il lavoro si è spostato dal
CRUD al rendere corretto il calcolo delle scadenze, distinguere l'iscrizione dal denaro
realmente incassato, e portare l'applicazione online su un database raggiungibile.

## A che punto siamo

Funziona ed è verificato:

- **Produzione online.** Il sito risponde, il middleware Edge protegge le rotte (307 verso
  `/login`, 401 sulle API), i loghi sono serviti, la connessione ad Atlas dalle funzioni
  serverless è confermata.
- **Due database sullo stesso cluster Atlas**: `subsmate` per Vercel, `subsmate_dev` per lo
  sviluppo locale, quest'ultimo copia del primo con gli stessi indici e lo stesso admin.
  Verificato che una scrittura dall'app locale finisce solo in `subsmate_dev`.
- **Scadenza** calcolata come giorno di addebito del servizio (18) nel mese successivo al
  pagamento, o tre mesi dopo se trimestrale. Conta il mese del pagamento, non il giorno.
- **Saldo del ciclo**: `paidForCurrentCycle` e `outstanding` in `lib/billing.ts`, esposti
  in elenco abbonamenti, scheda abbonamento e form di registrazione.
- **Elenchi ordinabili** per colonna su tutte e sei le tabelle, con l'ordinamento nell'URL.
- **CRUD Pagamenti**: creazione dalla pagina Pagamenti con selettore ricercabile, più
  l'eliminazione che già c'era.

A metà o non iniziato:

- **Nessuna prova manuale in browser.** Tutto è verificato via typecheck, lint, build,
  funzioni pure e chiamate HTTP alle route con una sessione firmata a mano. Il
  comportamento interattivo del selettore (digitare, filtrare, frecce) non è mai stato
  aperto in un browser.
- **Modifica di un pagamento: non esiste**, ed è il prossimo passo (vedi in fondo).
- **Lo stato resta basato sulle date, non sugli importi**: un versamento parziale fa
  avanzare `lastPaymentDate` e l'abbonamento risulta "In regola" fino alla scadenza, pur
  mostrando il residuo.

## Cosa abbiamo provato che NON ha funzionato

- **Diagnosticare il bug dell'importo forzato leggendo il codice.** Il sospetto era sulla
  route POST, che invece onora correttamente l'importo ricevuto: riprodotto con una
  chiamata HTTP diretta, salva 17 se riceve 17. La causa era nel form React. Quando
  qualcosa "viene forzato", riprodurre prima al livello più basso.
- **`pkill -f "next dev"` per fermare il dev server su Windows.** Non chiude il processo.
  Il vecchio server è rimasto sulla porta 3000 con la configurazione vecchia in memoria,
  il nuovo è ripiegato silenziosamente sulla 3001, e una scrittura di prova è finita in
  produzione invece che in sviluppo. Serve `Stop-Process -Id <pid> -Force`.
- **Sortare per cognome nella colonna Persona.** Scartato su richiesta: si ordina per
  email, che è l'identificativo univoco (indice unico su `Person`) e non collide fra
  omonimi.
- **Mappa slug → file per i loghi dei servizi.** Scartata: avrebbe reso l'aggiunta di un
  servizio una modifica di codice, contro il requisito di `PROJECT.md`. Si risolve per
  convenzione sul nome file.
- **Usare `toISOString()` nei controlli sulle date.** Sposta la data di un giorno rispetto
  ai componenti locali e ha prodotto nove falsi fallimenti in un test di verifica. Il
  codice era giusto, sbagliava il verificatore.

## Problemi incontrati e come li abbiamo risolti

- **«AUTH_SECRET non definita» all'avvio.** `frontend/.env.local` è gitignorato e non
  sopravvive a un clone o a un `git clean`. Ricreato da `.env.example` con l'URI presa
  dalla `.env` di root e un segreto nuovo. Un segreto nuovo invalida le sessioni: si rifà
  il login, le credenziali non cambiano.
- **`MONGODB_URI` indefinita pur essendoci una `.env`.** Next carica i file d'ambiente
  solo dalla directory del progetto: la `.env` di root serve agli script Python, non
  all'app.
- **Python e i MongoDB Database Tools non sono installati** su questa macchina: niente
  `mongorestore`, niente script di `execution/`. Copie e restore si fanno con il driver
  Node.
- **Importo forzato a 25,50.** Il campo aveva una `key` React legata all'abbonamento
  selezionato: sceglierlo *dopo* aver digitato l'importo rimontava il campo e lo riportava
  alla quota. Risolto con campi controllati e un flag "l'utente ha scritto".

## Decisioni prese

- **Scadenza ancorata al giorno di addebito del servizio** invece che al giorno del
  pagamento. Scartato tenere il giorno del versamento: dava scadenze diverse a chi paga il
  3 e a chi paga il 27 dello stesso mese. Il 18 è un dato sul documento `Service`, non una
  costante nel codice.
- **Segnalare il residuo invece di cambiare lo stato.** Scartato introdurre subito uno
  stato "Parziale": avrebbe toccato la macchina a stati a quattro valori delle brand
  guidelines. Resta una decisione di prodotto aperta.
- **Ordinamento nell'URL** (`?sort=&dir=`) invece che in stato client: vista condivisibile,
  pagine ancora Server Component, coerente con i filtri già esistenti.
- **Due database sullo stesso cluster** invece di due cluster: separazione sufficiente a
  non sporcare i dati reali, a costo zero.
- **Modifica dei pagamenti assente per scelta** finora: `Payment` è documentato come
  immutabile e si corregge cancellando e reinserendo. È esattamente ciò che il prossimo
  passo mette in discussione.

## File toccati

- `frontend/lib/billing.ts` — `onBillingDay()`, `nextDueDate()` riscritta, `paidForCycle()`,
  `paidForCurrentCycle` e `outstanding` in `SubscriptionComputation`, `coveredPeriod()`
  allineata al giorno di addebito.
- `frontend/lib/sorting.ts` — nuovo: `parseSort`, `sortRows`, `sortHrefBuilder`, funzioni pure.
- `frontend/lib/serviceLogo.ts` — nuovo: risolve `public/logo/<slug>.<ext>`, solo lato server.
- `frontend/lib/queries.ts` — passa pagamenti e logo al calcolo; una sola query per i pagamenti.
- `frontend/components/SubscriptionPicker.tsx` — nuovo: selettore ricercabile con tastiera.
- `frontend/components/RegisterPaymentForm.tsx` — campi controllati, residuo, niente sovrascrittura.
- `frontend/components/ui.tsx` — `SortableTh`, `ServiceMark` con logo, padding compattati.
- `frontend/components/PaymentRowActions.tsx` — aggiunto `NewPaymentButton`.
- `frontend/app/(protected)/**` — colonne ordinabili, residuo, loghi, spaziature.
- `frontend/app/api/subscriptions/[id]/**`, `app/api/people/[id]/route.ts` — giorno di
  addebito e storico pagamenti nel calcolo.
- `frontend/models/Service.ts`, `execution/seed_services.py` — giorno di addebito predefinito 18.
- `CLAUDE.md` — sezione Ambiente riscritta, nuova sezione Deploy su Vercel.
- `frontend/.env.local` (non versionato) — ricreato, punta a `subsmate_dev`.

## Dove vogliamo andare

1. **Implementare la modifica di un pagamento.** Serve una route `PATCH
   /api/subscriptions/[id]/payments/[paymentId]` e il **ricalcolo di `lastPaymentDate`**
   sull'abbonamento: se si modifica la data del pagamento più recente la scadenza cambia,
   se si modifica uno arretrato non deve cambiare nulla. Ricalcolare dal massimo `paidAt`
   rimasto, non incrementare. Rivedere anche `periodStart`/`periodEnd`, che oggi sono
   calcolati una volta sola alla creazione.
2. Decidere se la scelta "pagamento immutabile" resta valida: se la modifica entra,
   `models/Payment.ts` e la spec in `docs/superpowers/specs/` vanno aggiornati di
   conseguenza, e va aggiunta l'azione "Modifica" in `PaymentRowActions`.
3. Dopo: aprire l'app in un browser e provare a mano selettore, residuo e ordinamenti —
   è l'unica verifica mai fatta.

## Da sapere prima di toccare qualcosa

- **Non esiste un framework di test.** La verifica è build + lint + prova manuale. Per le
  funzioni pure di `lib/` si può usare `node file.mts` con l'import via `file:///D:/...`
  (Node 24 fa type stripping); per le route, una sessione si firma con `jose` prendendo
  `AUTH_SECRET` da `.env.local` e l'id admin da Mongo.
- **Fermare il dev server con `Stop-Process`, non `pkill`**, e controllare che sia davvero
  sulla 3000: se è occupata Next parte sulla 3001 senza fermarsi.
- **Cambiare `.env.local` non ha effetto su un server già avviato.**
- **Lo sviluppo locale usa `subsmate_dev`.** Non puntarlo su `subsmate`: è l'unica copia
  dei dati reali del team, ed è ciò che vede il sito pubblico.
- `frontend/AGENTS.md` e `frontend/CLAUDE.md` li riscrive `next dev` a ogni avvio: sono
  già committati, se riappaiono modificati non è un errore.
- I file di `execution/` non sono lanciabili qui: Python non è installato.
