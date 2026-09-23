# CRUD gestione entità — design

Data: 2026-09-22
Stato: approvato in brainstorming, da implementare

## Obiettivo

Oggi Persone, Servizi e Abbonamenti sono **di sola lettura in UI**: le liste esistono
(dashboard, `/abbonamenti`, `/persone`, `/servizi`, `/pagamenti`) ma creare, modificare o
eliminare un record richiede una chiamata API diretta (cURL o script) — gli `EmptyState`
delle pagine lo dicono esplicitamente. L'unico flusso di scrittura reale in UI è
`RegisterPaymentForm` nella pagina di dettaglio abbonamento.

Ora che l'app ha dati reali (24 persone importate), va resa gestibile interamente
dall'interfaccia: creare/modificare/eliminare Persone, Servizi, Abbonamenti, e correggere
un Pagamento registrato per errore.

## Stato attuale (verificato, non da rifare)

Il backend è quasi completo:

| Entità | GET lista | GET singolo | POST | PATCH | DELETE |
|---|---|---|---|---|---|
| Service | ✅ | ✅ | ✅ | ✅ | ✅ (409 se referenziato) |
| Person | ✅ | ✅ (con abbonamenti aggregati) | ✅ | ✅ | ✅ (409 se ha abbonamenti) |
| Subscription | ✅ | ✅ (con `computed` e storico pagamenti) | ✅ | ✅ | ✅ (cascata su Payment) |
| Payment | ✅ (per abbonamento) | — | ✅ (per abbonamento) | — (immutabile per convenzione) | ❌ manca |

Tutte le route sono già avvolte in `withAdmin()`. Validazione centralizzata in
`frontend/lib/validation.ts` (Zod): gli schemi di update sono già `.partial()` degli schemi
di create, quindi coprono già tutti i campi dei form descritti sotto — **nessuna modifica
agli schemi Zod esistenti**, salvo l'aggiunta di un nuovo schema per la cancellazione (vuoto,
non serve payload).

Ciò che manca è tutto **frontend**: nessun form, nessun modale, nessun componente di base
(input, select, dialog di conferma, notifica), e l'endpoint `DELETE` per il singolo
Pagamento.

## Requisiti decisi (dal brainstorming)

| Requisito | Scelta | Motivo |
|---|---|---|
| Pattern UI per creazione/modifica | Modale responsivo | Le brand guideline riservano già le ombre a "elementi sovrapposti (modali, menu a tendina)"; mantiene il contesto della lista sotto |
| Comportamento su mobile | Stesso componente, foglio a tutta larghezza ancorato in basso sotto i 640px (CSS/media query) | Nessuna logica duplicata, nessuna route "intercepting" di Next.js: complessità non giustificata per questa scala |
| Cancellazione Persona con abbonamenti | Blocca (409 già esistente), nessuna cascata dal frontend | I dati sono di fatturazione reale; l'API suggerisce già "disattivala invece" |
| Cancellazione Abbonamento con pagamenti | Permessa, ma il dialog di conferma dichiara esplicitamente quanti pagamenti e quale storico (€) verranno persi | Operazione irreversibile su denaro storico |
| Cancellazione Pagamento | Nuovo endpoint `DELETE`; ricalcola sempre `lastPaymentDate` sul pagamento rimasto più recente (o lo svuota) | Coerente con "nulla di calcolabile si scrive a mano"; una correzione non deve lasciare lo stato incoerente |
| Cancellazione Pagamento e `onboardingStatus` | Non viene toccato automaticamente | Campo ormai gestito manualmente dall'admin (vedi sotto): un'operazione sui pagamenti non deve sovrascrivere una scelta esplicita |
| Stato onboarding in Abbonamento | Campo modificabile nel form (select, 4 valori) | Serve per sospendere/cessare un abbonamento senza cancellarlo (mantiene lo storico pagamenti) |
| Slug Servizio | Fisso dopo la creazione | Evita di rompere riferimenti impliciti; generato automaticamente dal nome solo alla creazione (comportamento API già esistente) |
| Persona nuova durante creazione Abbonamento | Non prevista: si seleziona solo tra persone esistenti | Tiene la logica di creazione Persona in un solo posto |
| Test | Verifica manuale (build + lint + prova nel browser, anche a viewport mobile) | Nessun framework di test nel repo, scelta esplicita già presa |

## Architettura

**Pattern di mutazione**: identico a `RegisterPaymentForm`, che resta il riferimento.
Componente client con `useState` per `pending`/`error`, `fetch()` verso l'API REST
esistente con `Content-Type: application/json`, poi `router.refresh()` per far rileggere i
dati freschi al Server Component sopra. Niente Server Actions: si resta coerenti con il
pattern già in uso invece di introdurne un secondo.

**Composizione delle pagine**: le liste restano Server Component (fetch via
`lib/queries.ts`, invariato — nessuna pagina chiama le proprie API via HTTP, come da
regola del progetto). Ogni pagina guadagna due tipi di componenti client, piccoli e
mirati:

- un bottone azione nello slot `action` di `PageHeader` (già esiste, vedi
  `frontend/components/PageHeader.tsx`) che apre il modale di creazione;
- per ogni riga di tabella, un componente `RowActions` che apre il modale di modifica o il
  dialog di conferma eliminazione, passando come props i soli dati serializzabili già
  disponibili nella riga.

**Modale**: `<Modal open onClose>` generico e riusabile. Overlay scuro + dialog centrato su
desktop; sotto i 640px lo stesso markup diventa un foglio a tutta larghezza ancorato in
basso (media query CSS, nessuna duplicazione). Chiusura su `Esc` e su click sul backdrop.
Le ombre di questo componente sono l'unico punto dell'app che le usa, coerente con le brand
guideline.

**Feedback dopo il salvataggio**: il modale si chiude alla riuscita, quindi l'alert inline
(che resta per gli errori, mentre il modale è aperto — stesso pattern di
`RegisterPaymentForm`) sparirebbe con lui. Aggiunto un **toast** minimale, auto-dismiss,
montato una volta sola in `app/(protected)/layout.tsx`: conferma "Persona salvata",
"Abbonamento eliminato" ecc. Implementato come contesto React leggero (`useToast()`), niente
libreria esterna.

## Componenti nuovi

| File | Contenuto |
|---|---|
| `frontend/components/Modal.tsx` | `Modal`, gestione focus/`Esc`/backdrop, variante bottom-sheet via CSS |
| `frontend/components/ConfirmDialog.tsx` | Costruito su `Modal`; props `title`, `message` (`ReactNode`, per poter includere numeri calcolati tipo "3 pagamenti, 90,00 €"), `confirmLabel`, `onConfirm`. Nessun prop `danger`: colorare il bottone di conferma con lo stato critico violerebbe il vincolo "i colori di stato non vanno mai riusati per bottoni" già scritto in questo stesso documento — il rischio si comunica solo nel testo di `message` |
| `frontend/components/Toast.tsx` | `ToastProvider` + hook `useToast()`; una sola notifica visibile alla volta, auto-dismiss dopo qualche secondo |
| `frontend/components/form.tsx` | `Field`, `TextInput`, `NumberInput`, `Select`, `Textarea`, `inputClass` — estratti da `RegisterPaymentForm` (che oggi li definisce localmente) per essere condivisi da tutti i nuovi form. Piccolo refactor mirato: `RegisterPaymentForm` passa a importarli da qui invece di duplicarli nei 4 form nuovi |
| `frontend/components/PersonForm.tsx` | Form create/edit Persona, dentro un `Modal` |
| `frontend/components/ServiceForm.tsx` | Form create/edit Servizio, dentro un `Modal` |
| `frontend/components/SubscriptionForm.tsx` | Form create/edit Abbonamento, dentro un `Modal` |
| `frontend/components/PersonRowActions.tsx`, `ServiceRowActions.tsx`, `SubscriptionRowActions.tsx` | Icone modifica/elimina per riga; orchestrano `Modal`/`ConfirmDialog`/`useToast` |
| `frontend/components/New*Button.tsx` (o un unico `NewEntityButton` parametrico) | Bottone in `PageHeader.action` che apre il form in modalità creazione |

La scelta tra file singoli per entità e componenti generici parametrici (es. un solo
`EntityForm` con configurazione a campi) si lascia al piano di implementazione: qui conta
che il comportamento sia lo stesso per tutte e quattro le entità, non la granularità dei
file.

## Per entità

### Servizi

Campi form: nome, tariffa mensile (`monthlyRate`), giorno di addebito
(`billingDayOfMonth`, 1–31), attivo, note. Slug non è mai nel form (né in creazione né in
modifica): resta generato lato server da `slugify(name)` come già accade oggi in
`POST /api/services`. In modifica, l'API accetta il campo anche in `PATCH`, ma il form non
lo invia mai — restrizione solo lato client, coerente col modello di fiducia già adottato
nel progetto per gli admin. Non si duplica l'algoritmo di slug lato client (niente anteprima
live): evita che client e server divergano se `slugify()` cambia.

Eliminazione: se l'API risponde 409 (servizio referenziato da abbonamenti), il messaggio di
errore lo dice e suggerisce di disattivarlo dal form di modifica invece di eliminarlo.

### Persone

Campi form: nome, cognome, email, attiva, note.

Eliminazione: se l'API risponde 409 (persona con abbonamenti), il messaggio lo dice
("Ha N abbonamenti — rimuovili prima, o disattiva la persona") senza offrire cascata dal
frontend.

### Abbonamenti

Campi form: persona (select con ricerca tra le persone esistenti, nessuna creazione al
volo), servizio (select tra i servizi attivi), periodicità (`monthly`/`quarterly`),
supplemento donazione, **stato onboarding** (select, 4 valori:
`da_attivare`/`attivo`/`sospeso`/`cessato`, default `da_attivare` alla creazione), data
inizio, note. `lastPaymentDate` non è nel form: cambia solo registrando o cancellando un
pagamento (`RegisterPaymentForm` esistente e la nuova cancellazione).

Eliminazione: il `ConfirmDialog` recupera al volo `GET /api/subscriptions/:id` (già
restituisce `payments`) per mostrare "Verranno eliminati anche N pagamenti registrati,
totale storico € X" prima di procedere. Nessuna nuova query aggregata: si riusa l'endpoint
esistente.

### Pagamenti

Nessun form di modifica: restano immutabili per convenzione (`directives/registrazione_pagamento.md`).
Coperti:

- **Creazione**: invariata, resta sulla pagina di dettaglio abbonamento (`RegisterPaymentForm`,
  non toccato).
- **Cancellazione** (nuova): azione disponibile in due punti che riusano lo stesso
  `ConfirmDialog` e la stessa chiamata API — la tabella storico pagamenti nella pagina di
  dettaglio abbonamento, e la riga corrispondente nella pagina lista `/pagamenti`.

Non è previsto un flusso "nuovo pagamento" dalla pagina `/pagamenti`: registrare un
pagamento richiede sempre di partire dal suo abbonamento (pattern già esistente, evita di
duplicare un selettore di abbonamento altrove).

## API: nuovo endpoint

`DELETE /api/subscriptions/:id/payments/:paymentId`

1. Verifica che il pagamento esista e appartenga alla `subscription` indicata nell'URL
   (altrimenti 404).
2. Lo cancella.
3. Ricalcola `lastPaymentDate` dell'abbonamento: cerca il pagamento rimasto con `paidAt` più
   recente per quella `subscription` e lo usa; se non ne resta nessuno, imposta
   `lastPaymentDate: null`. Non tocca `onboardingStatus`.
4. Risponde con l'abbonamento aggiornato (`ok({ deleted: true, subscription })`), così il
   client può aggiornare la UI senza un secondo fetch.

Stessa protezione `withAdmin()` delle altre route. Nessun nuovo schema Zod necessario (niente
payload in ingresso).

## Gestione errori

- Conflitti (409) dall'API: mostrati come messaggio nel modale/dialog, form resta aperto
  con i dati inseriti (stesso pattern di errore inline di `RegisterPaymentForm`, con
  `role="alert"`).
- Successo: modale si chiude, toast di conferma, `router.refresh()` aggiorna la lista sotto.
- Validazione client: solo HTML5 di base (`required`, `min`, `step`, `type="email"`) come
  già fa `RegisterPaymentForm` — la validazione autorevole resta Zod lato server.

## File toccati (riepilogo)

### Nuovi
Vedi tabella "Componenti nuovi" sopra, più:
- `frontend/app/api/subscriptions/[id]/payments/[paymentId]/route.ts`

### Modificati
- Le 5 pagine sotto `app/(protected)/` (dashboard esclusa, che resta sola lettura):
  `abbonamenti/page.tsx`, `abbonamenti/[id]/page.tsx`, `persone/page.tsx`,
  `servizi/page.tsx`, `pagamenti/page.tsx` — aggiunta del bottone azione e delle
  `RowActions` per riga.
- `frontend/components/RegisterPaymentForm.tsx` — importa `Field`/`inputClass` da
  `components/form.tsx` invece di definirli localmente (nessun cambio di comportamento).
- `frontend/app/(protected)/layout.tsx` — monta `ToastProvider`.

## Verifica

Nessun framework di test (scelta esplicita, non se ne introduce uno ora). Per ciascuna
delle 4 entità, nel browser (`npm run dev`), oltre a `npm run build` + `npm run lint`:

1. Creazione: apre il modale, salva, il toast conferma, la riga compare nella lista senza
   ricaricare la pagina.
2. Modifica: precompilato con i valori esistenti, salva, la riga si aggiorna.
3. Eliminazione bloccata: Persona con abbonamenti, Servizio referenziato — messaggio 409
   chiaro, nessuna cancellazione.
4. Eliminazione permessa: Abbonamento con pagamenti — il dialog mostra il conteggio/importo
   corretto prima di confermare; dopo, l'abbonamento e i suoi pagamenti spariscono.
5. Cancellazione Pagamento: elimina il più recente di un abbonamento con più pagamenti,
   verifica che `lastPaymentDate` (e quindi la scadenza mostrata) si aggiorni al pagamento
   rimasto più recente; elimina l'unico pagamento rimasto, verifica che torni "Nessun
   pagamento registrato".
6. Mobile: `resize_window` sotto i 640px, il modale diventa foglio a tutta larghezza,
   resta usabile (nessuno scroll orizzontale, bottoni raggiungibili).

## Fuori scope

- Creazione di una Persona al volo durante la creazione di un Abbonamento.
- Creazione di un Pagamento dalla pagina `/pagamenti` (resta legata all'abbonamento).
- Modifica di un Pagamento esistente (resta immutabile: correzione = cancella e reinserisci).
- Cancellazione a cascata di una Persona con i suoi abbonamenti dal frontend.
- Ricerca/filtro avanzato nelle liste (non richiesto, non toccato da questo lavoro).
- Permessi differenziati per ruolo admin (invariato rispetto a oggi: tutti gli admin hanno
  gli stessi poteri).
