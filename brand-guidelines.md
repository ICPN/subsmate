# Brand Guidelines — SubsMate

## 1. Riferimento e contesto

Le indicazioni che seguono partono dall'analisi dello stile visivo del sito ICPN (icpn.it), l'organizzazione per cui SubsMate gestirà gli abbonamenti del team. Elementi osservati nelle schermate fornite:

- Header e footer in blu navy scuro (`#161b2d`), corpo pagina su sfondo bianco
- Card leggere: bordo sottile chiaro, angoli arrotondati, **nessuna ombra pesante**
- Un blocco scuro a tutta larghezza usato come momento di enfasi (sezione "I Nostri Valori"), non come sfondo generale
- Icone semplici a linea, dentro cerchi grigio chiaro
- Bottoni pieni scuri, rettangolari con angoli leggermente arrotondati, testo bianco
- Badge/pillole grigio chiaro per etichette brevi ("Full-time")
- Tipografia sans-serif pulita, titoli in grassetto, testo di supporto in grigio medio
- Molto spazio bianco, layout arieggiato, gerarchia chiara

SubsMate eredita questa identità (coerenza con l'organizzazione) ma la declina per il proprio scopo: non è un sito pubblico di community, è uno **strumento di lavoro per admin** che devono leggere velocemente importi, scadenze e stati di pagamento. Ogni scelta sotto è guidata da questo: chiarezza dei numeri prima di tutto, decorazione ridotta al minimo.

## 2. Principi di brand

1. **Leggibilità prima dell'estetica.** SubsMate vive di tabelle, importi e date. Ogni scelta tipografica e di colore è subordinata alla scansione rapida dei dati.
2. **Un solo elemento scuro, non uno sfondo scuro ovunque.** Come nel riferimento, il navy `#161b2d` è usato per header/footer e per un accento di enfasi puntuale — non per intere schermate, che restano chiare per non affaticare la lettura di tabelle lunghe.
3. **Lo stato si vede, non si legge.** Chi apre la dashboard deve capire in un colpo d'occhio chi è in ritardo, senza dover leggere ogni riga: il colore di stato è il principale strumento comunicativo dell'app.

## 3. Palette colori

**Base (identità, coerente con ICPN):**

| Nome | Hex | Uso |
|---|---|---|
| Ink Navy | `#161b2d` | Header, footer, testo primario su sfondo chiaro, bottoni primari |
| Paper | `#FFFFFF` | Sfondo principale dell'app |
| Surface | `#F4F5F8` | Sfondo di card e riquadri statistici |
| Border | `#E2E4EA` | Bordi sottili di card e tabelle |
| Ink Muted | `#5B6072` | Testo secondario, etichette, meta-informazioni |

**Funzionali (specifici di SubsMate, per lo stato dei pagamenti — non presenti nel sito di riferimento perché è un bisogno proprio dell'app):**

| Nome | Hex | Significato |
|---|---|---|
| Stato OK | `#2F8F5B` | In regola |
| Stato Attenzione | `#C98A1F` | In scadenza (entro 15 giorni) |
| Stato Critico | `#C4453B` | In ritardo |
| Stato Neutro | `#9AA0AE` | Da attivare / nessun dato |

I quattro colori di stato non vanno mai riusati per altro (bottoni, link, branding): devono restare un segnale univoco.

## 4. Tipografia

- **Titoli e numeri chiave:** Manrope (grassetto, 600–700) — forma geometrica e cifre ben distinguibili, utile per importi in evidenza (es. "Totale dovuto").
- **Testo, tabelle, dati:** Inter (400–500) — altissima leggibilità anche a corpo piccolo, ottima per righe di tabella dense e cifre tabellari allineate (`font-variant-numeric: tabular-nums`).

Due famiglie, ruoli distinti e non intercambiabili: Manrope per "guardare", Inter per "leggere/confrontare numeri". Evitare corsivo per enfasi; per evidenziare un importo critico si usa il colore di stato, non lo stile del carattere.

**Scala tipografica indicativa:**
- Titolo pagina: 28px / Manrope 700
- Titolo sezione/card: 18px / Manrope 600
- Corpo testo: 14px / Inter 400
- Dati tabellari/importi: 14px / Inter 500, tabular-nums
- Etichette/meta: 12px / Inter 500, colore Ink Muted (mai tutto maiuscolo)

## 5. Layout e struttura

```
┌───────────────────────────────────────────────┐
│  HEADER — Ink Navy, logo + nav + utente        │
├───────────────────────────────────────────────┤
│  Riepilogo: 3-4 card statistiche (Surface)     │
│  [Totale dovuto] [In ritardo] [In scadenza]    │
├───────────────────────────────────────────────┤
│  Tabella abbonamenti (Paper, bordi Border)     │
│  filtrabile per stato / servizio / persona     │
├───────────────────────────────────────────────┤
│  FOOTER — Ink Navy, minimale                   │
└───────────────────────────────────────────────┘
```

- Allineamento a sinistra per tutto il contenuto operativo (tabelle, form): è uno strumento di lavoro, non una pagina di marketing da centrare.
- Le card statistiche in alto sono l'unico punto dove si può centrare il numero, echeggiando la card "+3000 Membri Attivi" del riferimento.
- Angoli arrotondati moderati (8px) su card e bottoni, mai 0 (spigoloso) né eccessivamente pillola — coerente col riferimento.
- Bordi sottili (1px, colore Border) al posto di ombre: le ombre sono usate solo per elementi sovrapposti (modali, menu a tendina), mai per le card di contenuto normale.

## 6. Componenti chiave

**Bottone primario** — sfondo Ink Navy, testo bianco, angoli 8px, nessuna icona freccia aggiunta al testo (es. "Registra pagamento", non "Registra pagamento →").

**Bottone secondario** — sfondo trasparente, bordo 1px Border, testo Ink Navy.

**Badge di stato** — pillola piccola, sfondo del colore di stato al 12% di opacità, testo nello stesso colore a piena saturazione. Testo in sentence case ("In ritardo", non "IN RITARDO").

**Card statistica** — sfondo Surface, numero grande in Manrope, etichetta sotto in Ink Muted, nessuna icona decorativa a meno che non aggiunga informazione.

**Riga tabella abbonamento** — email/nome a sinistra, servizio con badge, importo allineato a destra in cifre tabellari, badge di stato come ultima colonna prima delle azioni.

**Icone** — solo lineari, monocromatiche, in cerchi Surface quando isolate (come nel riferimento); usate per identificare rapidamente un servizio (Claude/ChatGPT/futuri), non come decorazione.

## 7. Tono di voce nei testi dell'interfaccia

- Frasi brevi, verbo all'inizio per le azioni: "Registra pagamento", "Aggiungi abbonamento", "Segna come pagato".
- Gli stati sono descritti in modo diretto, mai ambiguo: "In ritardo di 5 giorni" è meglio di "Attenzione richiesta".
- Nessuna esclamazione, nessun tono promozionale: è uno strumento contabile, non un prodotto consumer.
- Gli errori spiegano cosa è successo e cosa fare: "Email già registrata per questo servizio — modifica l'abbonamento esistente invece di crearne uno nuovo."

## 8. Da evitare

- Sfondo scuro su intere pagine di dati (affatica la lettura di tabelle lunghe).
- Etichette in maiuscolo tracciato (stile "eyebrow").
- Frecce (→) decorative su bottoni e link.
- Ombre morbide generiche sotto ogni card: usare bordi sottili, coerenti col riferimento ICPN.
- Un quinto colore "decorativo" oltre a quelli in palette: ogni colore in SubsMate deve avere un significato (identità o stato), mai puramente estetico.
