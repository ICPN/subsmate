# Modifica di un pagamento registrato

Data: 2026-09-23

## Problema

Fino a oggi un pagamento era immutabile: `models/Payment.ts` lo dichiarava tale e le
correzioni si facevano cancellando la riga e reinserendola. Nella pratica la correzione
più frequente è un importo digitato male o una data sbagliata di qualche giorno, e
obbligare a cancellare e reinserire fa perdere `createdAt`, il riferimento e le note, e
costringe l'admin a ricordarsi i valori giusti mentre la riga non c'è più.

## Decisione

Il pagamento diventa **correggibile in-place ma non riassegnabile**. Una rotta
`PATCH /api/subscriptions/:id/payments/:paymentId` aggiorna importo, donazione, data,
metodo, riferimento e note sul documento esistente.

L'abbonamento a cui il pagamento è imputato resta immutabile: cambiarlo sposterebbe anche
`person`, denormalizzata sul pagamento, e la scadenza di due abbonamenti in una sola
operazione. Quel caso continua a essere cancella-e-reinserisci.

La correzione **non conserva il valore precedente**: l'unica traccia è `updatedAt`. È un
limite accettato consapevolmente, non una dimenticanza.

## Alternative scartate

**Storno con riga di rettifica.** Avrebbe mantenuto il registro append-only e la storia
completa di ogni correzione. Scartata perché ogni lettore dei pagamenti — elenco, saldo
del ciclo in `lib/billing.ts`, totale donazioni in dashboard, esportazioni future — avrebbe
dovuto riconoscere e ignorare le coppie stornate. Il costo ricade su tutto il sistema per
un beneficio che serve raramente.

**Modifica dei soli campi non contabili** (metodo, riferimento, note), lasciando importo e
data correggibili solo con cancella-e-reinserisci. Scartata perché l'importo sbagliato è
proprio l'errore più comune: la modifica non avrebbe coperto il caso per cui serve.

## Valori derivati da `paidAt`

Due valori dipendono dalla data del pagamento e vanno rifatti quando si sposta.

**`periodStart` / `periodEnd` sul pagamento.** Ricalcolati con `coveredPeriod(paidAt,
periodicity, service.billingDayOfMonth)`. Prima erano calcolati una volta sola alla
creazione: dopo una correzione della data sarebbero rimasti congelati sul periodo
sbagliato.

**`lastPaymentDate` sull'abbonamento**, da cui deriva la prossima scadenza. La regola
esistente — un pagamento con `paidAt` precedente non fa mai arretrare `lastPaymentDate` —
resta valida e vincola il ricalcolo:

| Situazione | Effetto |
| --- | --- |
| Il nuovo `paidAt` è più recente di `lastPaymentDate` | la data avanza |
| Il pagamento *definiva* `lastPaymentDate` (vecchio `paidAt >= lastPaymentDate`) e ora arretra | ricalcolo dal massimo `paidAt` fra i pagamenti dell'abbonamento |
| Il pagamento è arretrato e resta arretrato | nessun cambiamento |
| `paidAt` non è fra i campi inviati | nessun cambiamento |

Il ricalcolo parte sempre dal **massimo `paidAt` rimasto**, mai da un decremento della
data corrente: se il pagamento corretto arretra, la scadenza giusta è quella dettata da un
altro pagamento, che solo una query sa trovare. È la stessa logica già applicata alla
cancellazione, compreso il caso della data "orfana" creata dallo script di import (riga del
foglio con data ma importo mancante: l'abbonamento prende la data, il `Payment` non nasce).

`onboardingStatus` non viene toccato: è un campo che l'admin gestisce a mano e
un'operazione sui pagamenti non deve sovrascriverlo.

## Interfaccia

`RegisterPaymentForm` accetta una prop opzionale `payment`: quando è presente precompila i
campi con i valori registrati, nasconde il `SubscriptionPicker` e invia una PATCH invece di
una POST. Riusare il form invece di scriverne uno dedicato evita di duplicare il calcolo
del residuo e l'avviso sull'incasso parziale.

`PaymentRowActions` espone "Modifica" accanto a "Elimina", nello stesso `Modal` già usato
per la registrazione.

## Fuori scope

Nessuno storico delle versioni di un pagamento. Nessuno stato "Parziale" negli stati
dell'abbonamento: resta la decisione di prodotto aperta di segnalare il residuo senza
toccare la macchina a quattro stati delle brand guidelines.
