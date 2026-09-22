# Direttiva: Import iniziale dal Google Sheet

## Obiettivo
Migrazione una tantum dei dati dal Google Sheet "Application AI Team Plan (Responses)",
tab `Subs`, verso MongoDB.

## Input
- Export CSV del tab `Subs` salvato in `.tmp/subs_export.csv`, **oppure** accesso via API
  Google Sheets con `credentials.json` in root.

## Procedura
1. Esportare il tab `Subs` in CSV e salvarlo in `.tmp/subs_export.csv`.
2. Eseguire una prova a vuoto: `python execution/import_subs_from_sheet.py --dry-run`.
   Lo script stampa cosa creerebbe senza scrivere nulla.
3. Controllare il report: persone nuove, servizi riconosciuti, righe scartate.
4. Se il report è corretto: `python execution/import_subs_from_sheet.py`.
5. Verificare i totali in `GET /api/dashboard` confrontandoli con il Sheet.

## Mappatura colonne
Lo script usa `execution/column_map.json`: modificare quel file se le intestazioni del
Sheet cambiano, **non** il codice Python.

## Regole di idempotenza
- Le persone sono identificate dall'**email** (normalizzata a minuscolo).
- Gli abbonamenti dalla coppia persona + servizio.
- Rilanciare l'import non duplica: aggiorna i record esistenti.

## Casi limite
- Riga senza email valida → scartata e riportata nel log, non bloccante.
- Nome servizio non riconosciuto → la riga viene scartata; aggiungere prima il servizio
  (vedi `gestione_abbonamenti.md`) e rilanciare.
- Importi con virgola decimale o simbolo € vengono normalizzati dallo script.
- I pagamenti storici presenti nel Sheet vengono importati come righe di `payments`;
  `lastPaymentDate` viene impostata al pagamento più recente di ciascun abbonamento.

## Note apprese
- (da compilare dopo il primo import reale: struttura effettiva delle colonne, righe anomale)
