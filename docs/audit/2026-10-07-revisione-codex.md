# Revisione bug e sicurezza — 7 ottobre 2026

Revisione statica in sola lettura eseguita da Codex (job `task-muxyftrg-kxfj96`, sessione
`01a115df-31ae-7aa2-8419-540db8ec0127`), senza modifiche ai file né accessi a MongoDB. Metodo:
skill `codex-security:security-scan` più le invarianti di `CLAUDE.md`.

I finding sono **da verificare**: la colonna «Nota» riporta quello che è già noto dal lavoro
sul codice. File e righe sono quelli segnalati da Codex al momento della revisione.

## Riepilogo

| Area | Alta | Media | Bassa | Totale |
| --- | :---: | :---: | :---: | :---: |
| Bug di gestione | 2 | 8 | 2 | 12 |
| Sicurezza | 2 | 1 | 1 | 4 |
| **Totale** | **4** | **9** | **3** | **16** |

## Bug di gestione

| # | Gravità | Problema | Scenario | Correzione proposta | Dove | Nota |
| --- | --- | --- | --- | --- | --- | --- |
| B1 | Alta | Esecuzione della migrazione non atomica | Dopo il claim, abbonamenti, crediti, date e cessazione sono scritture separate. Se una fallisce, il `catch` ripristina solo la Migration: il resto resta scritto e un nuovo tentativo può fallire o duplicare. | Claim, rilettura del saldo e scritture in un’unica `session.withTransaction()`, con lo stato atteso nei filtri. | `frontend/app/api/migrations/[id]/execute/route.ts:112`, `:134`, `:174`, `:214` | |
| B2 | Alta | Pagamenti e consumo crediti esposti a race e scritture parziali | Due richieste parallele leggono lo stesso credito disponibile e lo spendono due volte. Incasso, credito e `lastPaymentDate` sono scritture distinte: un errore lascia uno stato parziale. Il blocco del doppio invio sta solo nell’interfaccia. | Transazione MongoDB, consumo del credito condizionale e chiave di idempotenza con vincolo univoco. | `frontend/app/api/subscriptions/[id]/payments/route.ts:57`, `:84`, `:127`, `:161` | |
| B3 | Media | Residuo di una migrazione multi-ciclo su un ciclo non visibile | Con credito per due cicli e parte del terzo, il residuo va sul terzo ma `lastPaymentDate` resta all’inizio del secondo: il residuo non riduce il prossimo importo proposto. | Con un residuo, portare `lastPaymentDate` all’inizio del ciclo coperto in parte. | `frontend/app/api/migrations/[id]/execute/route.ts:166`, `:171`, `:205` | |
| B4 | Media | `outstanding` vale zero senza pagamenti | Se `paid === 0` il residuo è 0 anche se manca tutto il dovuto; la dashboard sottostima il debito. | Calcolare sempre `Math.max(0, dueTotal - paid)`. | `frontend/lib/billing.ts:216`, `frontend/lib/queries.ts:375` | **Comportamento voluto.** «Da incassare» conta solo i residui dei cicli pagati in parte; il dovuto pieno è in «Dovuto nel ciclo corrente». Cambiarlo cambia il significato della dashboard. |
| B5 | Media | `periodEnd` salvato incoerente dopo cambi di periodicità o giorno di addebito | `paidForCycle` preferisce il `periodEnd` salvato: cambiando giorno di addebito o periodicità, i pagamenti esistenti possono uscire dal ciclo corrente (stato «non pagato», credito di migrazione errato). | Ricalcolare i periodi dei pagamenti ordinari dalla configurazione corrente, o riallinearli nella stessa transazione; conservare i periodi espliciti dei crediti. | `frontend/lib/billing.ts:168`, `frontend/app/api/services/[id]/route.ts:22`, `frontend/app/api/subscriptions/[id]/route.ts:51` | |
| B6 | Media | La PATCH di un abbonamento può cambiare persona e servizio | Lo schema di modifica è il `.partial()` di quello di creazione: via API si cambiano `person` e `service`, che l’interfaccia tratta come immutabili, scollegando pagamenti e migrazioni. | Schema di modifica senza `person` e `service`, `$set` costruito esplicitamente. | `frontend/lib/validation.ts:38`, `frontend/app/api/subscriptions/[id]/route.ts:63`, `frontend/components/SubscriptionForm.tsx:48` | |
| B7 | Media | Mancano controlli incrociati sui pagamenti | Accettati: totale zero, donazione maggiore dell’importo, credito superiore al residuo del ciclo. Un pagamento da zero attiva l’abbonamento e sposta la scadenza; il credito in eccesso viene consumato e perso. | `superRefine` e controlli sul server: `donazione <= importo`, totale positivo, credito entro il residuo. | `frontend/lib/validation.ts:53`, `frontend/app/api/subscriptions/[id]/payments/route.ts:57`, `:157` | |
| B8 | Media | Modifica ed eliminazione possono annullare l’avanzamento dei crediti multi-ciclo | Dopo una migrazione `lastPaymentDate` può avanzare di più cicli, ma i crediti hanno `paidAt` alla decorrenza. Modificando o eliminando un pagamento successivo, la data si ricostruisce dal massimo `paidAt` e arretra. | Derivare la data dai periodi coperti, non dal massimo `paidAt`, in transazione. | `frontend/app/api/subscriptions/[id]/payments/[paymentId]/route.ts:104`, `:172`, `frontend/app/api/migrations/[id]/execute/route.ts:205` | |
| B9 | Media | `toPeriodicity` accettata ma ignorata nella modifica di una migrazione | L’API valida il campo e risponde con successo, ma non lo salva: l’esecuzione usa la periodicità precedente. | Includere `toPeriodicity` nell’aggiornamento, `null` se coincide con l’attuale. | `frontend/lib/validation.ts:81`, `frontend/app/api/migrations/[id]/route.ts:37` | |
| B10 | Media | Cancellazioni e modifiche concorrenti lasciano migrazioni incoerenti | Eliminare abbonamenti o servizi ignora i riferimenti delle migrazioni. PATCH e DELETE di una migrazione controllano lo stato e poi scrivono senza `status: "pianificata"` nel filtro, sovrapponendosi all’esecuzione. | Bloccare o gestire i riferimenti; aggiornamenti condizionati sullo stato atteso. | `frontend/app/api/subscriptions/[id]/route.ts:90`, `frontend/app/api/services/[id]/route.ts:40`, `frontend/app/api/migrations/[id]/route.ts:24`, `:60` | |
| B11 | Bassa | La ricerca persone usa l’input come regex | Un valore come `[` produce una regex non valida e un errore 500; pattern complessi caricano il database. Solo per admin autenticati. | Escape dei metacaratteri e lunghezza massima. | `frontend/app/api/people/route.ts:12` | |
| B12 | Bassa | I filtri perdono la ricerca digitata | La ricerca aggiorna l’indirizzo con `history.replaceState`, ma i link dei filtri sono generati dal server col valore iniziale: scegliendo un filtro il testo digitato si perde. | Ricerca e filtri gestiti da un unico componente client, dai parametri correnti. | `frontend/components/SubscriptionsTable.tsx:82`, `frontend/app/(protected)/abbonamenti/page.tsx:96`, `:115` | |

## Sicurezza

| # | Gravità | Problema | Scenario | Correzione proposta | Dove | Nota |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | Alta | Password admin in chiaro nella documentazione versionata | La documentazione riporta una password di test che una direttiva dichiara ancora attiva in locale; sviluppo e produzione condividono account e hash. L’uso in produzione è un’ipotesi non verificata. | Cambiare subito le password di sviluppo e produzione separatamente, chiudere le sessioni, togliere la password anche dalla cronologia Git. | `docs/handoff/2026-09-22-admin-auth.md:148`, `directives/gestione_admin.md:37`, `CLAUDE.md:174` | **Priorità più alta.** |
| S2 | Alta | Credenziali e dump leggibili da altri utenti del computer | I file contengono URI e credenziali Atlas, `AUTH_SECRET`, hash admin e dati personali. Le ACL di Windows ereditate danno lettura a `BUILTIN\Users` e modifica ad `Authenticated Users`. Atlas accetta `0.0.0.0/0`: l’URI rubato funziona da qualunque rete. I file sono esclusi da Git. | Ruotare i segreti, spostare o cifrare i dump fuori dal progetto, ACL ristrette al proprietario, allowlist Atlas più stretta. | `.env:6`, `atlas-credentials.env:6`, `frontend/.env.local:3`, `:17`, `frontend/.tmp/backup-subsmate-2026-09-23T17-22-35/adminusers.json:4`, `people.json:4` | La regola `0.0.0.0/0` serve a Vercel (IP dinamici), vedi `CLAUDE.md`. |
| S3 | Media | Blocco del login aggirabile e usabile per enumerare o bloccare account | Il blocco si legge prima di `bcrypt.compare` e incremento e blocco sono scritture separate: tentativi paralleli superano il limite, e un login corretto in corso può cancellare un blocco appena applicato. Risposte diverse (401, 423) e nessun bcrypt per utenti inesistenti permettono di capire quali email esistono; tentativi ripetuti bloccano account veri. | Rate limit per IP e identificativo, risposta uniforme, hash fittizio per account inesistenti, aggiornamento atomico dei tentativi con attesa crescente. | `frontend/app/api/auth/login/route.ts:26`, `:29`, `frontend/lib/auth.ts:42` | |
| S4 | Bassa | Revoca delle sessioni con granularità di un secondo | `iat` è in secondi e la revoca usa `passwordChangedAt > iat`: un token emesso nello stesso secondo del cambio password resta valido per sette giorni. | `sessionVersion` incrementale nel database, o un nonce nel JWT. | `frontend/lib/session-token.ts:29`, `frontend/lib/auth.ts:33`, `frontend/app/api/auth/account/route.ts:64` | La rotta del profilo è `frontend/app/api/account/route.ts`, non `api/auth/account`. |

## Aree controllate senza problemi

| Area | Esito |
| --- | --- |
| Protezione delle rotte | Tutte le API non di login usano `withAdmin()`; tutte le pagine protette chiamano `requireAdmin()` prima di accedere ai dati. |
| JWT e cookie | HS256 vincolato in verifica, scadenza presente, cookie `HttpOnly`, `SameSite=Lax`, `Secure` in produzione. |
| Redirect, XSS, IDOR | Nessun open redirect sul parametro di ritorno, nessun XSS React, nessun IDOR nel modello ad admin condiviso. |
| Input verso MongoDB | Nessuna iniezione di operatori nei body, nessun mass assignment verso campi non previsti; conversioni `_id` corrette in `queries.ts`. |
| Totali di denaro | `credito_migrazione` escluso dai totali incassati. |
| Indici unici | Persona × servizio e migrazione pianificata. |
| Calcolo delle date | Aritmetica dei mesi, fine mese e confronti UTC in `billing.ts`. |
| Dipendenze | Advisory Next.js valutate rispetto alle funzioni effettivamente usate. |
| Script Python | Nessuna stampa delle credenziali; il rischio riguarda conservazione e permessi dei file (S2). |
