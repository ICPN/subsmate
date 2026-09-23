# Migrazione di un abbonamento da un servizio a un altro

Data: 2026-09-23

## Problema

Quando una persona del team lascia un servizio LLM per un altro — Claude verso ChatGPT —
oggi in SubsMate non c'è niente da fare se non cessare un abbonamento a mano e crearne un
altro. Si perdono tre cose: il fatto che il cambio era stato deciso in anticipo, il motivo
per cui il vecchio abbonamento è finito, e soprattutto il conto di quanto la persona deve
versare tenendo conto di ciò che ha già pagato e non userà.

Quel conto oggi si fa a mente, ed è esattamente il tipo di calcolo che rompeva il Google
Sheet che SubsMate sostituisce.

## Ambito

**Dentro:** cambio di servizio per la stessa persona, pianificato in anticipo, con una data
di decorrenza scelta dall'admin, un avviso prima che scatti e il calcolo del saldo.

**Fuori:** il cambio di periodicità sullo stesso servizio (si fa già modificando
l'abbonamento) e il trasferimento di un posto da una persona a un'altra. Sono migrazioni
in senso lato, ma non condividono né il calcolo né il flusso, e ognuna meriterebbe la
propria spec.

## Le regole sul denaro

Vengono dal modo in cui il team gestisce davvero i pagamenti, non da una convenzione
contabile generica.

**Un ciclo già pagato non si rimborsa in denaro.** Quanto è stato versato resta versato. Il
conguaglio esiste come *credito*, cioè come sconto sul primo ciclo del nuovo abbonamento.

**Il rateo è a mesi interi, mai a giorni.** Conta solo il numero di mesi pieni già pagati e
non goduti. Su periodicità trimestrale — che è la più diffusa nel team — il credito vale
uno o due mesi ed è significativo. Su periodicità mensile è quasi sempre zero, ed è
coerente con il principio precedente: il mese iniziato è pagato e finisce lì.

**Il credito nasce solo da una rinuncia.** Se il vecchio abbonamento viene chiuso in
anticipo, i mesi pagati che restano fanno credito. Se invece arriva alla sua scadenza
naturale — anche accavallandosi al nuovo — non si rinuncia a nulla, si usano due servizi
insieme, e il credito è zero.

### Formula

```
creditMonths = mesi interi fra la decorrenza e la scadenza del vecchio abbonamento
               (zero se il vecchio arriva a scadenza naturale)

credito = min(creditMonths × tariffaMensile(vecchio servizio), paidForCurrentCycle)

saldo = totalDue(nuovo abbonamento) − credito
```

### Esempio di riferimento

Claude 20 €/mese, ChatGPT 25 €/mese, entrambi trimestrali. A Marco resta un mese pagato di
Claude e chiude quell'abbonamento passando a ChatGPT.

```
quota nuovo trimestre      75,00   (25 × 3)
credito Claude residuo    −20,00   (20 × 1 mese)
───────────────────────────────────────────────
saldo da versare           55,00
```

L'interfaccia mostra la scomposizione, non il totale nudo:

```
mesi coperti dal credito   1 × (25 − 20)  =   5,00
mesi nuovi da aggiungere   2 × 25         =  50,00
───────────────────────────────────────────────────
saldo da versare                             55,00
```

Le due scritture coincidono sempre: è un'identità algebrica, non un'approssimazione che può
divergere dal totale.

### Ciclo pagato solo in parte

Il credito non può superare quanto è stato davvero incassato per il ciclo in corso. Se
Marco aveva versato solo 10 € dei 60 del trimestre, il credito per il mese residuo è 10 €,
non 20: si restituisce sotto forma di sconto ciò che è entrato, mai di più. In formula, il
credito è il minore fra `creditMonths × tariffaMensile` e `paidForCurrentCycle`, che
`computeSubscription` già calcola.

### Saldo negativo

Se i mesi di credito superano il ciclo nuovo — due mesi residui di un trimestre contro un
nuovo abbonamento mensile — il saldo esce negativo. Si mostra come **credito a favore, da
scalare dal ciclo successivo**, mai come rimborso in denaro: rimborsare contraddirebbe la
prima regola.

## Modello dati

Nuova collezione, `models/Migration.ts`. L'alternativa di due campi su `Subscription`
svuotati all'esecuzione è stata scartata: una migrazione eseguita non lascerebbe traccia, e
fra sei mesi nessuno saprebbe perché quell'abbonamento è cessato né quanto credito era
stato riconosciuto.

```ts
person            ObjectId → Person        required, index
fromSubscription  ObjectId → Subscription  required, index
toService         ObjectId → Service       required
toSubscription    ObjectId → Subscription  default null   // scritto all'esecuzione
effectiveDate     Date                     required       // decorrenza del nuovo
closeOld          "alla_decorrenza" | "a_scadenza"        default "alla_decorrenza"
status            "pianificata" | "eseguita" | "annullata" default "pianificata"
creditMonths      Number   default null                   // congelati all'esecuzione
creditMonthlyRate Number   default null
notes             String   default ""
timestamps
```

`closeOld` è il campo che distingue i due scenari, **non la data di decorrenza**:

- `alla_decorrenza` — il vecchio abbonamento cessa quando parte il nuovo. Rinuncia ai mesi
  pagati e non goduti, che diventano credito.
- `a_scadenza` — il vecchio arriva alla sua scadenza naturale. Se il nuovo parte prima, i
  due servizi si accavallano per un periodo e il credito è zero.

Indice unico **parziale** su `fromSubscription` limitato a `status: "pianificata"`: un
abbonamento può avere una sola migrazione pendente, ma quante ne vuole già eseguite o
annullate nella sua storia.

### Perché questi due numeri si salvano

`CLAUDE.md` vieta di salvare ciò che è calcolabile, e il saldo è calcolabile: **non va nel
database**. `creditMonths` e `creditMonthlyRate` sono invece *fatti* congelati al momento
dell'esecuzione, non derivazioni: dopo, il vecchio abbonamento è cessato e la tariffa del
servizio può essere cambiata, quindi non sarebbero più ricostruibili. Stanno sullo stesso
piano di `Payment.amount`, che è l'importo davvero incassato e non la quota dovuta.

Restano `null` finché la migrazione è solo pianificata: prima dell'esecuzione il credito si
calcola a ogni lettura come tutto il resto.

## Il credito nel saldo del nuovo abbonamento

Il nuovo abbonamento calcolerebbe `totalDue` = 75 €, ma la persona ne deve 55. Se il
credito non entra nel calcolo, l'elenco mostra un numero e l'admin ne chiede un altro.

**All'esecuzione si scrive un `Payment` sul nuovo abbonamento** di importo pari al credito,
con un campo nuovo `kind`:

```ts
kind: "incasso" | "credito_migrazione"   default "incasso"
```

`outstanding` diventa 55 € da solo, attraverso `paidForCycle` e `computeSubscription` che
già esistono: nessuna logica nuova nel motore di calcolo.

In cambio, **ogni aggregato di denaro incassato deve filtrare `kind: "incasso"`**, altrimenti
conterebbe 20 € che su ChatGPT non sono mai entrati. I punti da correggere sono gli
aggregati in `getDashboardData()` e i totali della pagina Pagamenti. La riga resta visibile
nello storico, etichettata come credito da migrazione: nasconderla renderebbe
inspiegabile il saldo.

L'alternativa — tenere il credito solo sul documento `Migration` e mostrare il saldo a
parte — è stata scartata perché lascia la riga dell'abbonamento a dichiarare 75 € mentre il
conto vero sta altrove.

## Calcolo: `lib/migration.ts`

Nuovo modulo di funzioni pure, con `now` sempre passato come parametro, secondo la stessa
disciplina di `lib/billing.ts`. Non accede al database.

- `creditMonths(effectiveDate, oldNextDueDate, closeOld)` — mesi interi fra le due date,
  zero se `closeOld = "a_scadenza"` o se la decorrenza cade dopo la scadenza.
- `migrationBalance(input)` — restituisce `{ creditMonths, creditAmount, newTotal, saldo }`
  più la scomposizione `{ convertedMonths, rateDifference, remainingMonths, remainingAmount }`
  che l'interfaccia mostra.
- `migrationAlert(migration, now)` — stato derivato dell'avviso, mai persistito.

`lib/billing.ts` non cambia. La migrazione lo usa (`totalDue`, `addMonths`, `daysBetween`,
`nextDueDate`) senza modificarlo: il motore di calcolo degli abbonamenti resta quello che è.

## Esecuzione

**Non esiste uno scheduler.** Il repo non ha job in background, e Vercel Cron sarebbe
infrastruttura nuova per una sola funzione. L'app avvisa, l'admin esegue premendo un
pulsante. Il momento dell'esecuzione è quindi un fatto registrato, non un automatismo di
cui fidarsi al buio.

`POST /api/migrations/:id/execute` fa, in quest'ordine:

1. Verifica che lo stato sia `pianificata`; altrimenti 409.
2. Verifica che la persona non abbia già un abbonamento sul servizio di destinazione
   (indice unico persona × servizio); altrimenti **409 con un messaggio esplicito**, non un
   errore Mongo grezzo.
3. Crea il nuovo `Subscription`: stessa persona, `toService`, periodicità e
   `donationSupplement` ereditati dal vecchio, `startDate` = decorrenza,
   `onboardingStatus` = `attivo`.
4. Calcola il credito e scrive `creditMonths` e `creditMonthlyRate` sulla migrazione.
5. Se il credito è maggiore di zero, crea il `Payment` con `kind: "credito_migrazione"`.
6. `status` → `eseguita`, `toSubscription` valorizzato.
7. Se `closeOld = "alla_decorrenza"`, il vecchio abbonamento passa a `cessato`.

Con `closeOld = "a_scadenza"` il vecchio resta attivo. Non serve un campo per ricordarsene:
la condizione *abbonamento attivo, con una migrazione eseguita che lo riguarda, e scadenza
passata* è derivabile a ogni lettura e fa comparire l'azione **Cessa**. È la stessa
filosofia del resto del progetto — nulla di calcolabile viene salvato.

## Avviso

Interamente derivato, nessun campo "avvisato" e nessun invio di email: nel repo non esiste
infrastruttura di notifica, e aggiungerla sarebbe un progetto a sé.

Riusa `DUE_SOON_DAYS = 15`, che viene dalle brand guidelines:

| Condizione | Messaggio | Colore |
| --- | --- | --- |
| Decorrenza entro 15 giorni | «Migrazione a ChatGPT fra 8 giorni» | attenzione |
| Decorrenza passata, ancora pianificata | «Migrazione in ritardo di 3 giorni» | critico |
| Eseguita, vecchio da cessare | «Claude scaduto, da cessare» | attenzione |

Compare in tre punti: una riga fra gli abbonamenti da seguire in dashboard, un badge sulla
riga dell'elenco abbonamenti, un banner sulla scheda dell'abbonamento.

I quattro colori di stato restano usati per stati veri, non per decorazione: la regola delle
brand guidelines regge.

## API

```
POST   /api/subscriptions/:id/migration     pianifica
PATCH  /api/migrations/:id                  modifica decorrenza, servizio, closeOld, note
DELETE /api/migrations/:id                  annulla (status → annullata, non cancella)
POST   /api/migrations/:id/execute          esegue
```

Tutte esportate avvolte in `withAdmin()`. Una migrazione già eseguita non si modifica né si
annulla: risponde 409. Le letture passano da `lib/queries.ts`, che resta l'unica fonte: le
pagine non chiamano le proprie API via HTTP.

## Interfaccia

Nessuna pagina nuova. Il flusso vive dove vive già l'abbonamento.

- **Scheda abbonamento**: pulsante «Pianifica migrazione»; il form chiede servizio di
  destinazione, decorrenza e sorte del vecchio abbonamento, e mostra **l'anteprima del saldo
  che si aggiorna mentre scegli**. Pianificare senza vedere il numero è metà della funzione.
- **Banner** sulla scheda quando esiste una migrazione pianificata, con «Esegui adesso» e
  «Annulla migrazione».
- **Badge** nella riga dell'elenco abbonamenti.
- **Dashboard**: le migrazioni imminenti o in ritardo entrano fra le cose da seguire.

Il saldo e la sua scomposizione si mostrano con `tabular-nums`, in italiano, con stati
espliciti nel tono già in uso («Migrazione fra 8 giorni», non «Attenzione richiesta»).

## Verifica

Non esiste un framework di test nel repo. La verifica è quella già in uso:

1. `npx tsc --noEmit` e `npm run lint`.
2. Le funzioni pure di `lib/migration.ts` provate con `node file.mts` su casi costruiti a
   mano: credito zero per accavallamento, un mese residuo, saldo negativo, decorrenza dopo
   la scadenza.
3. Le rotte chiamate via HTTP con una sessione firmata a mano, contro `subsmate_dev`.
4. Prova manuale in browser dell'anteprima del saldo, che è l'unica parte interattiva.

## Fuori scope

Invio di email o notifiche push. Esecuzione automatica alla decorrenza. Cambio di
periodicità e trasferimento fra persone. Storico delle versioni di una migrazione
pianificata: modificarla la sovrascrive, come per i pagamenti.
