# Direttiva: Gestione abbonamenti e servizi

## Obiettivo
Creare e mantenere servizi, persone e abbonamenti, mantenendo coerenti quote e scadenze.

## Aggiungere un nuovo servizio (es. un terzo LLM)
Non richiede modifiche al codice: è un documento nella collezione `services`.

`POST /api/services`
```json
{ "name": "Gemini", "monthlyRate": 20, "billingDayOfMonth": 5 }
```
Lo `slug` viene derivato dal nome se omesso. `monthlyRate` è la tariffa **mensile per persona**:
la quota trimestrale si ottiene moltiplicando per 3, non va inserita a mano.

## Aggiungere una persona
`POST /api/people` con `firstName`, `lastName`, `email`. L'email è univoca: è la chiave
usata dall'import per riconoscere le persone già presenti.

## Creare un abbonamento
`POST /api/subscriptions`
```json
{
  "person": "<personId>",
  "service": "<serviceId>",
  "periodicity": "monthly",
  "donationSupplement": 5,
  "onboardingStatus": "da_attivare"
}
```
Vincolo: una sola sottoscrizione per coppia persona/servizio (indice unico). Un secondo
`POST` sulla stessa coppia risponde 409.

## Stati onboarding
- `da_attivare` — creato ma mai pagato. Non entra nel totale dovuto della dashboard.
- `attivo` — impostato automaticamente alla registrazione del primo pagamento.
- `sospeso` — temporaneamente fermo, resta in elenco.
- `cessato` — chiuso, storico conservato.

## Casi limite
- Eliminare un servizio usato da abbonamenti restituisce 409: va **disattivato**
  (`active: false`), non cancellato, altrimenti si perde lo storico.
- Stesso comportamento per le persone con abbonamenti collegati.
- Cambiare `monthlyRate` di un servizio cambia il dovuto **futuro**: i pagamenti già
  registrati conservano l'importo storico e non vengono ricalcolati.
