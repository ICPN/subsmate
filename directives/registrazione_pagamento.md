# Direttiva: Registrazione di un pagamento

## Obiettivo
Registrare un incasso, aggiornare la data dell'ultimo pagamento e, di conseguenza,
la prossima scadenza e lo stato dell'abbonamento.

## Input
- `subscriptionId` dell'abbonamento
- (opzionale) importo, quota donazione, data, metodo, riferimento

## Procedura
`POST /api/subscriptions/<id>/payments`
```json
{ "paidAt": "2026-09-22", "method": "bonifico", "reference": "CRO 1234" }
```
Se `amount` è omesso viene calcolato come `tariffa mensile × mesi periodicità + donazione`.
Se `donationAmount` è omesso si usa il `donationSupplement` configurato sull'abbonamento.

## Effetti
1. Nuova riga nello storico (`payments`), con `periodStart`/`periodEnd` del ciclo coperto.
2. `lastPaymentDate` aggiornata → la prossima scadenza si sposta avanti di 1 mese
   (mensile) o 3 mesi (trimestrale).
3. Se l'abbonamento era `da_attivare` passa ad `attivo` e riceve una `startDate`.

## Casi limite e note apprese
- **Pagamento arretrato**: se `paidAt` è precedente all'ultimo pagamento registrato, la riga
  entra nello storico ma `lastPaymentDate` **non** arretra — altrimenti la scadenza tornerebbe
  indietro e l'abbonamento risulterebbe falsamente in ritardo.
- **Importo parziale**: si registra con l'`amount` effettivo. Il sistema non tiene un saldo
  residuo: l'importo va annotato in `notes` e la differenza registrata come pagamento separato.
- **Correzione di un pagamento errato**: i pagamenti sono immutabili per scelta. Si cancella
  la riga e la si reinserisce, poi si verifica che `lastPaymentDate` sia coerente.
- Il mese corto è gestito: 31 gennaio + 1 mese = 28/29 febbraio (`addMonths` in `lib/billing.ts`).
