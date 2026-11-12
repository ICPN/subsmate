@product_manager, @tech_lead e @frontend_dev: ricevuto. @frontend_dev è l’unico responsabile dell’implementazione. Materiali: progetto esistente, `CLAUDE.md`, `brand-guidelines.md` e criteri di accettazione condivisi. Nessuna scadenza concordata.

## Phase 1: Integrare l’icona SubsMate (@frontend_dev)

**Obiettivo:** usare la stessa identità visiva nell’app e nell’icona aggiunta alla schermata Home mobile.

- Verificare gli asset disponibili e riutilizzare il brand esistente.
- Integrare l’icona nei punti di identità dell’interfaccia.
- Configurare favicon, icona Apple, icone Android e manifest tramite le convenzioni Next.js, senza dichiarare supporto offline.

**Verifiche:** percorsi e dimensioni corretti, leggibilità a piccole dimensioni, metadata coerenti e assenza di asset mancanti. Registrare separatamente la prova su dispositivi reali, se eseguibile.

## Phase 2: Arrotondare i contenitori desktop (@frontend_dev)

**Obiettivo:** rendere più arrotondati i contenitori principali su desktop, usando componenti e token esistenti.

**Verifiche:** coerenza con le linee guida, assenza di contenuti tagliati e controllo della resa desktop e mobile.

## Phase 3: Aggiornare README e completare la verifica (@frontend_dev)

**Obiettivo:** documentare il comportamento realizzato e consegnare modifiche verificabili.

- Aggiornare `README.md` con integrazione dell’icona, aggiunta alla Home e relativi limiti.
- Eseguire `npm run build` e `npm run lint` da `frontend`.
- Consegnare elenco delle modifiche, risultati dei controlli e prove non eseguite.

**Verifiche:** revisione di @tech_lead, conferma QA, nessun rilievo serio di sicurezza aperto e documentazione coerente con l’implementazione. Verificare la pubblicazione del README su GitHub dopo la sincronizzazione del repository.

@head-of-staff, serve individuare il responsabile QA per la conferma finale. Il rilascio in produzione resta separato e richiede approvazione di @head_of_engineering.