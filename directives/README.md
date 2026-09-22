# Direttive SubsMate

Indice delle SOP. Ogni direttiva descrive **cosa** fare; l'esecuzione sta in `execution/`.

| Direttiva | Scopo |
| --- | --- |
| [setup_ambiente.md](setup_ambiente.md) | Preparare ambiente locale, `.env`, MongoDB Atlas, diagnosi connessione |
| [import_google_sheet.md](import_google_sheet.md) | Import una tantum dei dati dal Sheet "Application AI Team Plan" |
| [gestione_abbonamenti.md](gestione_abbonamenti.md) | Creare/modificare abbonamenti, aggiungere servizi |
| [registrazione_pagamento.md](registrazione_pagamento.md) | Registrare un pagamento e aggiornare scadenza/stato |

## Regole del modello dati (valgono per tutte le direttive)

- Un abbonamento è una coppia **persona × servizio**. Una persona può averne più di uno.
- **Nulla di calcolabile viene salvato.** Quota, totale dovuto, prossima scadenza e stato
  pagamento sono derivati a ogni lettura da `frontend/lib/billing.ts`. Non aggiungere
  campi `status` o `nextDueDate` al database: andrebbero fuori sincrono.
- Le uniche date persistite sono `startDate` e `lastPaymentDate` sull'abbonamento,
  e `paidAt` / `periodStart` / `periodEnd` sui pagamenti.
- Gli importi sono in euro, numerici, mai stringhe formattate.
