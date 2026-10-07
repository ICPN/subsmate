import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/requireAdmin";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui";
import { DUE_SOON_DAYS } from "@/lib/billing";

/**
 * Guida d'uso per gli admin, organizzata per compito.
 *
 * Il testo descrive il comportamento del codice: chi cambia una regola di
 * calcolo, un flusso o un'etichetta dell'interfaccia descritti qui aggiorna
 * anche questa pagina (regola in CLAUDE.md). La soglia «in scadenza» arriva da
 * lib/billing.ts per non poter andare fuori sincrono; gli importi degli esempi
 * sono esempi, riferiti alle tariffe di ottobre 2026.
 */

const SECTIONS = [
  { id: "concetti", title: "Concetti chiave" },
  { id: "nuovo-abbonamento", title: "Aggiungere una persona a un servizio" },
  { id: "registrare-pagamento", title: "Registrare un pagamento" },
  { id: "correggere-pagamento", title: "Correggere o eliminare un pagamento" },
  { id: "primo-mese", title: "Gestire il primo mese di ChatGPT" },
  { id: "migrazione", title: "Spostare una persona su un altro servizio" },
  { id: "sospendere-chiudere", title: "Sospendere o chiudere un abbonamento" },
  { id: "sollecitare", title: "Trovare chi sollecitare" },
  { id: "servizi", title: "Aggiungere un servizio o cambiare una tariffa" },
  { id: "profilo", title: "Cambiare email e password" },
  { id: "casi-frequenti", title: "Casi frequenti" },
];

export default async function GuidePage() {
  await requireAdmin("/guida");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Guida"
        description="Come gestire gli abbonamenti del team con SubsMate, un compito alla volta. Ogni sezione dice cosa fare e cosa calcola l’app dopo."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <nav aria-label="Indice della guida" className="lg:sticky lg:top-6 lg:self-start">
          <Card title="Indice">
            <ol className="space-y-1 px-4 py-3 text-sm">
              {SECTIONS.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="block py-1 text-[var(--ink-muted)] underline-offset-2 hover:text-[var(--ink-navy)] hover:underline"
                  >
                    {section.title}
                  </a>
                </li>
              ))}
            </ol>
          </Card>
        </nav>

        <div className="min-w-0 space-y-6">
          <Section id="concetti" title="Concetti chiave">
            <Dl>
              <Term name="Servizio">
                Un abbonamento LLM del team, come Claude o ChatGPT. Ha una tariffa mensile per
                persona, un supplemento donazione standard e il giorno del mese in cui la
                piattaforma addebita.
              </Term>
              <Term name="Persona">Un membro del team, riconosciuto dall’email.</Term>
              <Term name="Abbonamento">
                Una persona su un servizio: una riga per ogni coppia. La stessa persona può
                averne più di uno, per esempio Claude e ChatGPT, ciascuno con la sua periodicità.
              </Term>
              <Term name="Ciclo">
                Il periodo coperto da un pagamento: un mese (mensile) o tre (trimestrale).
              </Term>
              <Term name="Totale dovuto">
                Tariffa mensile × mesi del ciclo, più il supplemento donazione. Esempio ChatGPT
                trimestrale: 12,20 × 3 + 2,40 = 39 €.
              </Term>
            </Dl>

            <H3>Come si calcola la scadenza</H3>
            <P>
              Conta il <strong>mese</strong> dell’ultimo pagamento, non il giorno. La scadenza cade
              nel giorno di addebito del servizio, uno o tre mesi dopo quel mese. Con addebito il
              18, chi paga il 3 settembre e chi paga il 27 settembre (mensile) scadono entrambi il
              18 ottobre.
            </P>

            <H3>Gli stati</H3>
            <Dl>
              <Term name="In regola">Mancano più di {DUE_SOON_DAYS} giorni alla scadenza.</Term>
              <Term name="In scadenza">
                Mancano {DUE_SOON_DAYS} giorni o meno, compreso il giorno stesso.
              </Term>
              <Term name="In ritardo">La scadenza è passata senza un nuovo pagamento.</Term>
              <Term name="Da attivare">
                L’abbonamento esiste ma non ha ancora pagamenti: non ha una scadenza.
              </Term>
              <Term name="Cessato">
                L’abbonamento è chiuso: non risulta mai in ritardo e non compare fra quelli da
                seguire.
              </Term>
            </Dl>

            <Note>
              Stato, scadenza e importo dovuto non si modificano a mano: l’app li ricalcola a ogni
              apertura dai pagamenti registrati. Se uno di questi valori è sbagliato, la causa è
              un pagamento mancante o registrato male, e si corregge quello.
            </Note>

            <H3>Crediti</H3>
            <P>
              Alcune righe dello storico non sono soldi entrati in quel momento ma crediti: il
              <em> credito migrazione</em> (mesi già pagati su un altro servizio) e il{" "}
              <em>credito primo mese</em> (la parte del primo mese che ChatGPT non ha addebitato).
              Chiudono un ciclo come un pagamento, ma restano fuori dai totali incassati.
            </P>
          </Section>

          <Section id="nuovo-abbonamento" title="Aggiungere una persona a un servizio">
            <Steps>
              <li>
                Se la persona non c’è ancora: <Ui>Persone</Ui> → <Ui>Aggiungi persona</Ui>, con
                nome, cognome ed email.
              </li>
              <li>
                <Ui>Abbonamenti</Ui> → <Ui>Aggiungi abbonamento</Ui>. Scegli persona e servizio:
                il supplemento donazione si compila con quello del servizio. Mettilo a 0 se la
                persona non dona.
              </li>
              <li>Scegli la periodicità, mensile o trimestrale, e lascia lo stato «Da attivare».</li>
              <li>
                Quando arriva il primo versamento, registralo dalla scheda dell’abbonamento:
                l’abbonamento passa da solo ad «Attivo» e prende come data di inizio quella del
                pagamento.
              </li>
            </Steps>
            <Note>
              Ogni coppia persona × servizio esiste una volta sola. Se la persona aveva già quel
              servizio, anche chiuso, apri l’abbonamento esistente invece di crearne un altro.
            </Note>
          </Section>

          <Section id="registrare-pagamento" title="Registrare un pagamento">
            <P>
              Dalla scheda dell’abbonamento (riquadro <Ui>Registra pagamento</Ui>) oppure da{" "}
              <Ui>Pagamenti</Ui> → <Ui>Registra pagamento</Ui>, cercando la persona per nome,
              email o servizio.
            </P>
            <Steps>
              <li>
                Controlla l’importo proposto: è il totale dovuto, o quello che manca se il ciclo è
                già pagato in parte. Scrivi l’importo davvero ricevuto, anche se è diverso.
              </li>
              <li>Indica la parte di donazione, la data, il metodo e, se c’è, il riferimento (CRO, ID transazione).</li>
              <li>
                Salva. La scadenza si sposta avanti di un ciclo e lo stato si aggiorna.
              </li>
            </Steps>

            <H3>Pagamento parziale</H3>
            <P>
              Registra l’importo ricevuto: il modulo avvisa quanto mancherà per chiudere il
              ciclo, e la scheda mostra «Incassati … : mancano …». Quando arriva il resto,
              registralo come un nuovo pagamento: l’app lo attribuisce allo stesso ciclo e non
              sposta di nuovo la scadenza.
            </P>

            <H3>Pagamento arretrato</H3>
            <P>
              Un pagamento con una data precedente all’ultimo registrato entra nello storico ma
              non fa tornare indietro la scadenza. Serve a completare lo storico senza far
              risultare in ritardo chi è in regola.
            </P>
          </Section>

          <Section id="correggere-pagamento" title="Correggere o eliminare un pagamento">
            <Steps>
              <li>
                Nello storico (scheda dell’abbonamento o pagina <Ui>Pagamenti</Ui>) usa{" "}
                <Ui>Modifica</Ui> sulla riga: si correggono importo, donazione, data, metodo,
                riferimento e note.
              </li>
              <li>
                Cambiando la data, il periodo coperto e la scadenza si ricalcolano da soli.
              </li>
              <li>
                Un pagamento imputato all’abbonamento sbagliato non si sposta: eliminalo con{" "}
                <Ui>Elimina</Ui> e registralo di nuovo su quello giusto.
              </li>
            </Steps>
            <Note>
              Eliminando il pagamento più recente, la scadenza torna a quella calcolata dal
              pagamento precedente. Eliminando l’unico pagamento, la scadenza si calcola dalla
              data di inizio dell’abbonamento.
            </Note>
            <P>
              Le righe di credito migrazione non si modificano né si eliminano: si annullano solo
              insieme alla migrazione che le ha create. Le righe di credito primo mese si eliminano
              ma non si modificano (vedi la sezione successiva).
            </P>
          </Section>

          <Section id="primo-mese" title="Gestire il primo mese di ChatGPT">
            <P>
              Quando aggiungi un posto a metà ciclo, ChatGPT addebita solo i giorni fino al
              rinnovo. La persona però ha versato il mese intero: la differenza è un suo credito,
              da scalare al pagamento successivo. La donazione resta fuori dal calcolo.
            </P>
            <Example>
              Trimestrale da 39 € (12,20 × 3 + 2,40). OpenAI addebita 5 € per il primo mese: il
              credito è 12,20 − 5 = 7,20 €, e al rinnovo la persona versa 39 − 7,20 = 31,80 €.
            </Example>
            <Steps>
              <li>
                Verifica sulla fattura di OpenAI quanto è stato addebitato per il primo mese.
              </li>
              <li>
                Apri la scheda dell’abbonamento → <Ui>Modifica</Ui> → «Addebito del fornitore per
                il primo mese». Salva: la scheda mostra «Credito primo mese da usare».
              </li>
              <li>
                Al rinnovo registra il pagamento come sempre. Il campo «Credito primo mese da
                usare» è già compilato e l’importo proposto è già scontato. Puoi abbassare il
                credito, o metterlo a 0 per usarlo la volta dopo. Non può superare quanto resta da
                coprire sul ciclo insieme all’importo: andrebbe perso.
              </li>
            </Steps>
            <Note>
              Il credito viene fissato quando inserisci l’addebito e non cambia se in seguito
              cambia la tariffa. Si ricalcola solo se correggi l’addebito.
            </Note>
            <P>
              Per annullare un credito usato per errore, elimina la riga «Credito primo mese»
              dallo storico: torna disponibile. Se la persona passa a un altro servizio, il
              credito non usato passa con lei.
            </P>
          </Section>

          <Section id="migrazione" title="Spostare una persona su un altro servizio">
            <P>
              Il passaggio, per esempio da ChatGPT a Claude, si pianifica in anticipo e si esegue
              alla data scelta. L’app non lo esegue da sola: avvisa, e l’esecuzione la fai tu.
            </P>
            <Steps>
              <li>
                Dalla scheda del vecchio abbonamento: <Ui>Pianifica migrazione</Ui>. Scegli il
                nuovo servizio, la periodicità e la decorrenza (proposta: la scadenza attuale).
              </li>
              <li>
                Scegli cosa succede al vecchio abbonamento:
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  <li>
                    <strong>Cessa alla decorrenza</strong>: i mesi interi già pagati e non goduti
                    diventano credito sul nuovo servizio.
                  </li>
                  <li>
                    <strong>Resta attivo fino alla sua scadenza</strong>: i due servizi si
                    accavallano e non c’è credito per i mesi.
                  </li>
                </ul>
              </li>
              <li>
                Controlla il saldo nell’anteprima e salva. Sulla scheda compare un riquadro con la
                migrazione, e in dashboard la sezione «Migrazioni in arrivo». Nei{" "}
                {DUE_SOON_DAYS} giorni prima della decorrenza la migrazione compare anche fra gli
                abbonamenti da seguire.
              </li>
              <li>
                Alla decorrenza, dal riquadro sulla scheda: <Ui>Esegui migrazione</Ui>. L’app crea
                il nuovo abbonamento (o riattiva quello chiuso, se la persona era già stata su quel
                servizio), registra il credito e, con «Cessa alla decorrenza», chiude il vecchio.
              </li>
            </Steps>

            <H3>Come si calcola il credito</H3>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              <li>Contano solo i mesi interi fra la decorrenza e la vecchia scadenza: un mese iniziato è consumato.</li>
              <li>
                Un mese vale quanto la persona versa al mese, donazione compresa: chi paga 39 € a
                trimestre ha mesi da 13 €.
              </li>
              <li>Il credito non supera quanto è stato davvero incassato per quel ciclo.</li>
              <li>Il credito primo mese ancora disponibile si aggiunge sempre, per intero.</li>
              <li>
                Un ciclo pagato non si rimborsa in denaro: il credito si spende sui cicli del nuovo
                servizio, uno alla volta, anche se ne copre più di uno.
              </li>
            </ul>
            <Example>
              ChatGPT trimestrale da 39 €, 7,20 € di credito primo mese, migrazione a Claude con
              2 mesi non goduti: credito 2 × 13 + 7,20 = 33,20 €. Il primo trimestre Claude (30 €)
              è coperto e 3,20 € passano al ciclo successivo, che diventa quello corrente: la
              scheda chiede i 26,80 € che mancano.
            </Example>
            <Note>
              Il supplemento donazione segue il servizio: sul nuovo abbonamento vale quello del
              servizio di destinazione, e chi non donava resta a 0. Finché la migrazione è solo
              pianificata si annulla con <Ui>Annulla migrazione</Ui>. Con «Resta attivo fino alla
              sua scadenza», passata la vecchia scadenza l’app segnala «Vecchio abbonamento
              scaduto, da cessare»: impostalo su «Cessato» da <Ui>Modifica</Ui>.
            </Note>
          </Section>

          <Section id="sospendere-chiudere" title="Sospendere o chiudere un abbonamento">
            <P>
              Dalla scheda dell’abbonamento → <Ui>Modifica</Ui> → «Stato onboarding».
            </P>
            <Dl>
              <Term name="Sospeso">Fermo temporaneamente: resta in elenco, con il suo storico.</Term>
              <Term name="Cessato">
                Chiuso: lo storico resta consultabile, lo stato diventa «Cessato» e l’abbonamento
                esce dai conteggi di ritardo e scadenza. Non si offre più nella registrazione dei
                pagamenti dalla pagina Pagamenti e non si può migrare.
              </Term>
            </Dl>
            <Note>
              Chiudere è quasi sempre meglio che eliminare. <Ui>Elimina</Ui> su un abbonamento
              cancella anche tutti i suoi pagamenti. Non si eliminano un abbonamento con migrazioni
              registrate (annulla prima quella pianificata), né persone o servizi con abbonamenti o
              migrazioni collegati: si disattivano.
            </Note>
          </Section>

          <Section id="sollecitare" title="Trovare chi sollecitare">
            <Steps>
              <li>
                <Ui>Dashboard</Ui>: i riquadri «In ritardo» e «In scadenza» contano gli abbonamenti
                da seguire, e la tabella «Abbonamenti da seguire» li elenca dal più arretrato.
              </li>
              <li>
                <Ui>Abbonamenti</Ui>: filtra per stato o per servizio, e cerca per nome, email o
                servizio. Il filtro resta nell’indirizzo della pagina, quindi si può condividere.
              </li>
              <li>
                <Ui>Persone</Ui>: per ogni persona il totale dovuto su tutti i suoi servizi, utile
                quando qualcuno paga Claude e ChatGPT insieme.
              </li>
            </Steps>
            <Dl>
              <Term name="Dovuto nel ciclo corrente">
                Somma dei totali dovuti degli abbonamenti attivi.
              </Term>
              <Term name="Da incassare">
                Quanto manca sui cicli pagati solo in parte.
              </Term>
              <Term name="Incassato">
                Tutto il denaro registrato, crediti esclusi.
              </Term>
            </Dl>
          </Section>

          <Section id="servizi" title="Aggiungere un servizio o cambiare una tariffa">
            <Steps>
              <li>
                <Ui>Servizi</Ui> → <Ui>Aggiungi servizio</Ui>: nome, tariffa mensile per persona,
                supplemento donazione per ciclo e giorno di addebito della piattaforma (1–31).
              </li>
              <li>
                La tariffa è sempre <strong>mensile</strong>: per i trimestrali l’app la moltiplica
                per 3 da sola.
              </li>
            </Steps>
            <Note>
              Cambiare una tariffa cambia il dovuto da quel momento in poi. I pagamenti già
              registrati conservano il loro importo, e i crediti primo mese già fissati non
              cambiano. Un servizio che non si usa più si disattiva: non compare come
              destinazione delle migrazioni.
            </Note>
          </Section>

          <Section id="profilo" title="Cambiare email e password">
            <Steps>
              <li>
                <Ui>Profilo</Ui>, nell’header accanto a «Esci» (nel menu, da telefono). Ogni
                modifica chiede la password attuale.
              </li>
              <li>
                <strong>Email</strong>: è quella con cui accedi. Le sessioni aperte restano valide.
              </li>
              <li>
                <strong>Password</strong>: almeno 12 caratteri. Resti collegato su questo
                dispositivo, mentre le sessioni aperte altrove vengono chiuse.
              </li>
            </Steps>
            <Note>
              Cinque password sbagliate, al login o nel profilo, bloccano l’account per 15
              minuti. I nuovi account admin e il ripristino di una password dimenticata non si
              fanno dall’app: chiedi a chi gestisce SubsMate.
            </Note>
          </Section>

          <Section id="casi-frequenti" title="Casi frequenti">
            <Faq question="Ha pagato il 3, perché scade il 18 e non il 3?">
              La scadenza segue il giorno di addebito del servizio, non quello del versamento:
              tutti pagano per lo stesso giorno in cui la piattaforma addebita il team.
            </Faq>
            <Faq question="Ha pagato, ma la scheda dice che mancano dei soldi.">
              Il pagamento registrato è inferiore al totale dovuto. Registra il resto come nuovo
              pagamento quando arriva, oppure correggi l’importo se era sbagliato.
            </Faq>
            <Faq question="Ha pagato, ma risulta ancora in ritardo.">
              Controlla che il pagamento sia sull’abbonamento giusto (persona e servizio) e che la
              data sia corretta: un pagamento con una data precedente all’ultimo registrato non
              sposta la scadenza.
            </Faq>
            <Faq question="Ho registrato un pagamento sbagliato.">
              Usa <Ui>Modifica</Ui> sulla riga per importo, data o metodo. Se è
              sull’abbonamento sbagliato, eliminalo e registralo di nuovo su quello giusto.
            </Faq>
            <Faq question="Il totale incassato non torna con lo storico.">
              Le righe di credito (migrazione e primo mese) compaiono nello storico ma non nei
              totali incassati: non sono denaro entrato in quel momento.
            </Faq>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6">
      <Card title={title}>
        <div className="space-y-4 px-4 py-4 text-sm leading-relaxed">{children}</div>
      </Card>
    </section>
  );
}

function H3({ children }: { children: ReactNode }) {
  return (
    <h3 className="pt-1 font-[family-name:var(--font-manrope)] text-[15px] font-semibold">
      {children}
    </h3>
  );
}

function P({ children }: { children: ReactNode }) {
  return <p>{children}</p>;
}

function Steps({ children }: { children: ReactNode }) {
  return <ol className="list-decimal space-y-2 pl-5 marker:text-[var(--ink-muted)]">{children}</ol>;
}

/** Nome di una pagina o di un bottone dell'app, così come appare a schermo. */
function Ui({ children }: { children: ReactNode }) {
  return <span className="font-medium text-[var(--ink-navy)]">{children}</span>;
}

function Dl({ children }: { children: ReactNode }) {
  return <dl className="space-y-2">{children}</dl>;
}

function Term({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div>
      <dt className="font-medium">{name}</dt>
      <dd className="text-[var(--ink-muted)]">{children}</dd>
    </div>
  );
}

function Note({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
      {children}
    </p>
  );
}

function Example({ children }: { children: ReactNode }) {
  return (
    <p className="tnum rounded-[var(--radius)] border border-[var(--border)] px-3 py-2">
      <span className="font-medium">Esempio. </span>
      {children}
    </p>
  );
}

function Faq({ question, children }: { question: string; children: ReactNode }) {
  return (
    <div>
      <p className="font-medium">{question}</p>
      <p className="mt-1 text-[var(--ink-muted)]">{children}</p>
    </div>
  );
}
