---
type: handoff
date: 2026-09-23
status: pronto-per-review
seq: 1
prev: nessuno
tags: [crud, subagent-driven-development, abbonamenti, persone, servizi, pagamenti]
---

## Obiettivo

SubsMate aveva solo pagine di sola lettura per Servizi, Persone, Abbonamenti, Pagamenti.
L'obiettivo era rendere tutte e quattro le entità gestibili (creazione, modifica,
eliminazione) da UI, senza introdurre campi calcolati persistiti (vincolo architetturale
del progetto: quota/totale/scadenza/stato pagamento restano sempre derivati a runtime in
`frontend/lib/billing.ts`).

## A che punto siamo

Ramo `feat/crud-gestione`, 10 commit sopra `main`, working tree pulito. Tutti gli 8 task
del piano sono completi, la review finale sull'intero branch è stata fatta e la sua unica
fix wave consentita è stata applicata e ri-verificata pulita. `npx tsc --noEmit`,
`npm run lint`, `npm run build` tutti puliti sull'ultimo commit (`420ba70`).

Il workspace SDD (`.superpowers/sdd/2026-09-22-crud-gestione/`, gitignored) è stato
cancellato: il lavoro è concluso, non c'è più bisogno del ledger.

**Non ancora fatto**: l'utente ha scelto esplicitamente di lasciare il branch così com'è
— se ne occuperà lui/lei per merge/push. Nessuna azione di integrazione è stata eseguita
da parte mia.

## Cosa abbiamo provato che NON ha funzionato

- **Import dati da Google Sheet**: il primo tentativo cercava il file sbagliato
  ("Application AI Team Plan (Responses)") invece di `Subs_LLM`, quello corretto secondo
  l'utente. Corretto cercando esplicitamente il nome giusto.
- **`column_map.json`** inizialmente includeva `"Piano"`/`"Plan"` fra gli header candidati
  per il campo `service` — nel foglio Subs_LLM quell'header contiene la tariffa ("Pro
  Team"), non il nome del servizio, e `pick()` sceglie il primo header trovato in ordine
  di lista. Avrebbe silenziosamente scambiato la tariffa per il servizio. Rimosso
  Piano/Plan, aggiunti gli header corretti `"LLM"`/`"AI"`.
- **`check_db_connection.py`** segnalava "PORTA 27017 BLOCCATA" mentre in realtà Mongo
  locale era raggiunto correttamente — lo script tenta sempre TLS (pensato per Atlas) e fa
  un falso positivo contro Mongo locale non-TLS. Verificata la connettività direttamente
  via Python invece di fidarsi del verdetto dello script.
- **`seed_demo_data.py --reset`** non è un flag di sola rimozione: ricrea anche i dati
  demo. Per una pulizia pura è stato scritto uno script Python una tantum che replica solo
  la logica di rimozione (filtro email `@example.test`).
- **EnterWorktree** per eseguire il piano: rifiutato — la sua descrizione lo riserva ai
  casi in cui l'utente o CLAUDE.md dicono esplicitamente "worktree", il che non si
  applicava qui. Usato invece un normale `git checkout -b`, coerente con un rifiuto già
  documentato in precedenza in questo repo per lo stesso motivo (le pagine verificano a
  runtime contro `frontend/.env.local`, gitignored, e `node_modules`, che un worktree
  fresco non avrebbe senza ricrearli).

## Problemi incontrati e come li abbiamo risolti

- **CSV del Google Sheet con preambolo**: 8 righe di parametri/legenda prima dell'header
  reale. Risolto con `tail -n +9` prima del parsing.
- **`monthlyRate` dei servizi ancora al placeholder demo (25.0)** dopo l'import per
  entrambi i servizi — corretto con un update diretto su Mongo ai valori reali
  (Claude 8.50, ChatGPT 12.20) dopo conferma esplicita dell'utente.
- **Task 5, `openConfirm` non controllava `response.ok`** prima di leggere il conteggio
  pagamenti da eliminare — un fallimento della richiesta veniva mostrato come "nessun
  pagamento", rendendo l'eliminazione apparentemente senza conseguenze. Corretto
  aggiungendo il controllo, disabilitando la conferma e mostrando l'errore (commit
  `2140f13`).
- **Route `DELETE .../payments/[paymentId]` regrediva `lastPaymentDate`**: ricalcolava
  sempre `lastPaymentDate` come il massimo dei pagamenti rimanenti, ma lo script di import
  può produrre abbonamenti con `lastPaymentDate` senza un `Payment` corrispondente
  (importato dalla data del foglio anche quando l'importo era `<= 0` e il pagamento non
  veniva creato). Eliminare un pagamento più vecchio poteva quindi far arretrare o
  azzerare una data più recente e legittima. Corretto: il ricalcolo tocca
  `lastPaymentDate` solo se `payment.paidAt >= subscription.lastPaymentDate` al momento
  dell'eliminazione, altrimenti la lascia invariata (commit `420ba70`,
  `frontend/app/api/subscriptions/[id]/payments/[paymentId]/route.ts`).
- **`toISOString().slice(0,10)` (data UTC) vs `formatDate` (data locale)**: una data con
  componente orario non-zero poteva mostrare un giorno diverso nel form di modifica
  rispetto alla tabella, e il salvataggio riscriveva il valore shiftato. Aggiunta
  `toDateInputValue()` locale in `frontend/lib/billing.ts`, adottata nei 3 punti che
  usavano la conversione UTC.
- **`<select disabled>` esclude il campo da FormData al submit**: per questo la modalità
  di modifica di Abbonamento mostra persona/servizio come testo `<p>` di sola lettura,
  mai come `<select disabled>`.

## Decisioni prese

- **Pattern modale responsive invece di pagine dedicate** per create/modifica, su tutte e
  quattro le entità — scelto dall'utente rispetto all'alternativa di pagine `/nuovo` /
  `/modifica` dedicate, per coerenza mobile-desktop con un solo componente.
- **Eliminazione Persone/Servizi: blocco puro (409) se hanno abbonamenti collegati**,
  scartata la cascata automatica — l'utente ha scelto esplicitamente "Blocca e basta" per
  evitare eliminazioni accidentali di storico pagamenti collegato.
- **Eliminazione Abbonamenti: conferma con avviso esplicito del numero di pagamenti che
  verranno persi**, scartata una conferma generica — l'utente ha scelto esplicitamente
  "Sì, avviso esplicito".
- **Eliminazione Pagamenti: `lastPaymentDate` sempre ricalcolato** (mai lasciato stantio),
  scelto dall'utente rispetto a lasciarlo invariato.
- **`onboardingStatus` modificabile manualmente** dal form Abbonamento, scelto dall'utente
  rispetto a renderlo fisso e derivato solo dai pagamenti.
- **Slug del Servizio generato solo server-side, immutabile dopo la creazione**, scelto
  dall'utente rispetto a renderlo un campo editabile.
- **Nessuna creazione inline di Persona durante la creazione di un Abbonamento** — solo
  persone esistenti selezionabili, scelto dall'utente rispetto a un flusso di creazione
  rapida integrato.
- **Esecuzione tramite subagent-driven-development** (dispatch di un implementatore fresco
  per task con gate di review), scelta dall'utente rispetto all'esecuzione inline diretta
  — opzione "1" fra le due presentate.
- **Un'unica fix wave sulla review finale del branch** (5 Important + 2 Minor collegati,
  in un solo dispatch consolidato), come da policy della skill SDD: non è previsto un
  secondo giro di fix — i residui vengono adjudicati e archiviati, non ripresi.
- **Correzione della spec doc fatta direttamente dal controller** (rimozione della
  menzione a un prop `danger` di `ConfirmDialog` mai costruito, perché contraddiceva il
  vincolo "niente colori di stato su bottoni/decorazioni") invece di passare da un
  subagent — modifica solo documentale, zero rischio codice.
- **Findings esplicitamente archiviati senza fix** (confermati Minor/non bloccanti dal
  reviewer): duplicazione di markup in `LoginForm.tsx` (mai toccato dai task), messaggio
  generico sul 409 da chiave duplicata in creazione abbonamento, assenza di focus-trap/
  scroll-lock/focus-restoration nella `Modal`, edge case di JSON malformato su risposta
  200, 3 round-trip DB sequenziali nella cancellazione pagamento invece di un'operazione
  atomica.
- **Integrazione del branch lasciata all'utente** — alla domanda della skill
  `finishing-a-development-branch` ("merge locale / push+PR / lascia così com'è"),
  l'utente ha scelto esplicitamente di lasciare il branch com'è.

## File toccati

- `execution/column_map.json` — mapping colonne corretto per l'import da Subs_LLM
  (`service`, `donationSupplement`, `amount`).
- `directives/setup_ambiente.md`, `directives/import_google_sheet.md` — aggiornate con le
  lezioni imparate durante l'import (falso positivo TLS, file sorgente corretto, preambolo
  CSV).
- `frontend/components/form.tsx` — primitive di form condivise (`Field`, `TextInput`,
  `Select`, `Textarea`, `Checkbox`, `ErrorMessage`) più il nuovo helper `submitJson()`
  (wrapping di `fetch` con try/catch per i fallimenti di rete).
- `frontend/components/Modal.tsx`, `ConfirmDialog.tsx`, `Toast.tsx` — primitive UI
  riusabili: modale responsive bottom-sheet/centrata, dialogo di conferma con gestione
  errori, toast singolo con auto-dismiss.
- `frontend/components/ServiceForm.tsx`, `ServiceActions.tsx`,
  `frontend/components/PersonForm.tsx`, `PersonActions.tsx`,
  `frontend/components/SubscriptionForm.tsx`, `SubscriptionActions.tsx`,
  `frontend/components/PaymentRowActions.tsx` — form e azioni CRUD per le quattro entità.
- `frontend/app/api/subscriptions/[id]/payments/[paymentId]/route.ts` — nuova route
  `DELETE` con ricalcolo guardato di `lastPaymentDate`.
- `frontend/app/(protected)/servizi/page.tsx`, `persone/page.tsx`, `abbonamenti/page.tsx`,
  `abbonamenti/[id]/page.tsx`, `pagamenti/page.tsx` — aggiunta colonna/bottone "Azioni" e
  pulsanti di creazione.
- `frontend/lib/billing.ts` — nuovo helper `toDateInputValue()` per date locali
  `yyyy-mm-dd`.
- `frontend/components/RegisterPaymentForm.tsx` — refactorizzato per usare le primitive di
  `form.tsx` e `submitJson()`.
- `docs/superpowers/specs/2026-09-22-crud-gestione-design.md`,
  `docs/superpowers/plans/2026-09-22-crud-gestione.md` — spec e piano dell'implementazione
  (corretta la spec per rimuovere il prop `danger` mai costruito).

## Dove vogliamo andare

Il branch `feat/crud-gestione` resta così com'è: l'integrazione (merge locale o push+PR
su `main`) è a carico dell'utente, per sua scelta esplicita. Nessuna azione ulteriore è
richiesta da parte mia finché non viene chiesto di riprendere il merge o di lavorare su
un nuovo task.

## Da sapere prima di toccare qualcosa

- Non esiste un framework di test in questo progetto: la verifica è
  `npx tsc --noEmit && npm run lint && npm run build` più prova manuale in browser con i
  dati demo. Non inventare `npm test`.
- `check_db_connection.py` dà un falso "porta bloccata" contro Mongo locale non-TLS —
  verificare la connettività direttamente prima di fidarsi del suo verdetto negativo.
- `seed_demo_data.py --reset` ricrea i dati demo, non li rimuove soltanto.
- Il repo usa un'identità git locale (`yintong-zhou <zhouyintong96@gmail.com>`) diversa da
  quella globale: non sovrascriverla, non usare `--global`.
