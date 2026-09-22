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

**Primo import reale eseguito il 22/09/2026: 24 persone, 24 abbonamenti, 19 pagamenti, 0 scartate.**
Totale storico importato (€544,00) verificato contro il totale `TOTALE RICEVUTO (storico)`
del foglio: combacia esattamente.

- **Il file sorgente reale si chiama `Subs_LLM`**, non "Application AI Team Plan (Responses)"
  (quel titolo è un modulo di raccolta email separato, tab `Form Responses 1` + `Subs` con
  colonne diverse e più povere). `Subs_LLM` è di proprietà dell'utente, aggiornato a mano,
  ed è la fonte con le colonne allineate al modello dati: usare quello.
- **L'export CSV di un Google Sheet multi-tab restituisce solo il primo tab** (qui era `Subs`,
  seguito da `Legenda`). Se in futuro l'ordine dei tab cambia o serve un tab diverso da quello
  esportato di default, non c'è modo di scegliere il tab dall'export diretto: servirebbe
  l'API Sheets con `gid` esplicito.
- **Il tab `Subs` di `Subs_LLM` ha un blocco parametri/riepilogo nelle prime 8 righe** (tariffe
  mensili, totali storici) prima della vera intestazione (`ID,NOME,COGNOME,EMAIL,...`, riga 9).
  Lo script si aspetta l'intestazione in riga 1: **prima di lanciare l'import bisogna tagliare
  il blocco parametri** dal CSV esportato (es. `tail -n +9`), non modificare lo script per
  cercare l'intestazione a runtime.
- **Le intestazioni reali non corrispondevano a `column_map.json`** ed è stato aggiornato:
  - servizio: la colonna si chiama `LLM` (non `Servizio`/`Service`). Rimossi `Piano`/`Plan`
    dalla mappatura `service`: in questo foglio `PIANO` indica il piano tariffario ("Pro Team"),
    non l'LLM — tenerlo in lista avrebbe fatto leggere per sbaglio "Pro Team" come nome
    servizio, perché `pick()` fa match sulla prima intestazione della lista che trova nella riga,
    non sulla più specifica. Aggiunto anche `AI`, usata nell'altro foglio.
  - `donationSupplement`: intestazione reale `DONAZIONE (€)`, non `Donazione` — `pick()` fa
    match esatto (case-insensitive) sull'intestazione intera, un suffisso come `(€)` la fa
    fallire silenziosamente (campo letto come stringa vuota, nessun errore).
  - `amount`: nessuna colonna si chiama `Importo`/`Quota`/`Amount`. Il valore giusto per lo
    storico pagamenti è `RICEVUTO STORICO (€)` (l'importo davvero incassato), non
    `TOTALE DOVUTO (€)` che è un totale calcolato (quota + donazione) — coerente con la regola
    di `CLAUDE.md` di non trattare come dato grezzo ciò che è derivato.
  - `PERIODICITÀ`, `DATA ULTIMO PAGAMENTO`, `NOME`, `COGNOME`, `EMAIL`, `NOTE` combaciavano già.
- **Righe con `NOTE` tipo `* spostare` o `* dati disallineati nel foglio originale, da
  verificare`** vengono importate così come sono, senza logica speciale: sono marcatori per
  chi cura il foglio, non per lo script. Dopo l'import vale la pena scorrere le note per capire
  se richiedono un intervento manuale sui record appena creati.
- **Le 5 righe `ChatGPT` con stato `Checking`** non hanno `DATA ULTIMO PAGAMENTO`: importate
  correttamente come abbonamento `da_attivare`, senza righe in `payments` (lo script salta
  l'inserimento se manca la data, anche se la donazione è valorizzata).
