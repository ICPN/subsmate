# Direttiva: Gestione degli account admin

## Obiettivo
Creare, aggiornare e revocare gli accessi amministratore di SubsMate.

## Creare un admin
```bash
python execution/seed_admin.py --email "nome@icpn.it" --name "Nome Cognome"
```
La password si inserisce a schermo, mai come argomento: finirebbe nella cronologia della
shell. Minimo 12 caratteri. Il primo admin creato riceve il ruolo `owner`, i successivi `admin`;
al momento i due ruoli hanno gli stessi poteri.

## Cambiare una password dimenticata
```bash
python execution/seed_admin.py --email "nome@icpn.it" --reset-password
```
Aggiorna `passwordChangedAt`, quindi **tutte le sessioni aperte di quell'admin cadono**.

## Revocare un accesso
Impostare `active: false` sul documento in `adminusers`. La sessione cade alla richiesta
successiva. Non cancellare il documento: si perderebbe il riferimento storico.

## Casi limite
- **`AUTH_SECRET` cambiata o rigenerata**: tutte le sessioni di tutti gli admin cadono. È
  la leva da usare se si sospetta che un cookie sia stato esfiltrato.
- **Account bloccato per tentativi falliti**: si sblocca da solo dopo 15 minuti, oppure
  azzerando `lockedUntil` e `failedLoginAttempts` sul documento.
- **Nessun admin in database**: ogni pagina reindirizza a `/login` e nessuna credenziale
  funziona. Si esce solo rieseguendo il seed.
- **Admin locale con password di prova**: l'admin attualmente presente nel database
  locale (`yintong.zhou@icpn.it`) ha una password di prova impostata durante lo sviluppo
  automatizzato del Task 7. Va rigenerata con `python execution/seed_admin.py --email
  "yintong.zhou@icpn.it" --reset-password` da un terminale interattivo (lo script usa
  `getpass`, che non legge da stdin non interattivo) prima di qualsiasi uso reale.
