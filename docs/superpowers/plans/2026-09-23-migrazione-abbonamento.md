# Migrazione di un abbonamento — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettere di pianificare in anticipo il passaggio di una persona da un servizio LLM a un altro, avvisando prima della decorrenza e calcolando il saldo da versare tenendo conto dei mesi già pagati e non goduti.

**Architecture:** Una nuova collezione `Migration` tiene il piano e, all'esecuzione, i due fatti non più ricostruibili (mesi di credito e tariffa del vecchio servizio). Il saldo non si salva mai: si deriva da funzioni pure in `lib/migration.ts`, che usano `lib/billing.ts` senza modificarlo. All'esecuzione il credito entra nel saldo del nuovo abbonamento come `Payment` con `kind: "credito_migrazione"`, così `computeSubscription` continua a essere l'unico motore di calcolo.

**Tech Stack:** Next.js 16 App Router (Server Components, route handler), TypeScript, Mongoose su MongoDB Atlas, Zod per la validazione, Tailwind con i token di `app/globals.css`.

**Spec:** `docs/superpowers/specs/2026-09-23-migrazione-abbonamento-design.md`

## Global Constraints

- **Non esiste un framework di test.** La verifica è `npx tsc --noEmit`, `npm run lint`, script `node` una tantum per le funzioni pure e chiamate HTTP per le rotte. Non inventare `npm test`.
- Gli script di verifica vanno in `.tmp/`, che non si committa mai.
- Interfaccia, commenti e messaggi di errore **in italiano** con accenti corretti; identificatori di codice in inglese.
- Nulla di calcolabile finisce nel database: niente campi `saldo`, `status` di pagamento o `nextDueDate` sugli schemi.
- Ogni route handler sotto `app/api/` va esportata avvolta in `withAdmin()`. Verifica: `grep -rLn "withAdmin" app/api --include=route.ts | grep -v auth/` non deve stampare nulla.
- Le pagine non chiamano le proprie API via HTTP: ogni lettura passa da `lib/queries.ts`.
- Le funzioni di `lib/` sono pure e ricevono sempre `now` come parametro.
- `DUE_SOON_DAYS = 15` viene dalle brand guidelines: si riusa, non si duplica con un altro numero.
- Nessun tema scuro; i quattro colori di stato non si riusano per bottoni, link o decorazione; `tabular-nums` su tutti gli importi e le date.
- Lo sviluppo locale punta a `subsmate_dev`. Non puntarlo su `subsmate`.
- I comandi si lanciano da `frontend/`, tranne git che gira dalla root del repo.

## Review Focus

Cinque condizioni che la spec implica e che romperebbero l'uso reale. Ogni riga ha il suo test nel task che possiede il codice.

1. **Decorrenza successiva alla scadenza del vecchio** (pausa fra i due abbonamenti): il credito deve essere zero, non negativo. Test nel Task 1.
2. **Vecchio abbonamento senza pagamenti**, quindi `nextDueDate` nullo: il calcolo deve restituire credito zero invece di lanciare. Test nel Task 1.
3. **Ciclo corrente pagato solo in parte**: il credito non può superare quanto davvero incassato. Test nel Task 1.
4. **La persona ha già un abbonamento sul servizio di destinazione**: l'esecuzione deve rispondere 409 con un messaggio leggibile, non con l'errore grezzo dell'indice unico. Test nel Task 6.
5. **Esecuzione ripetuta della stessa migrazione**: la seconda deve rispondere 409 senza creare un secondo abbonamento né un secondo `Payment` di credito. Test nel Task 6.

---

## File Structure

| File | Responsabilità |
| --- | --- |
| `frontend/lib/migration.ts` | *Creare.* Funzioni pure: mesi di credito, saldo con scomposizione, stato dell'avviso. Nessun accesso al database. |
| `frontend/models/Migration.ts` | *Creare.* Schema della migrazione, indice unico parziale sulle pianificate. |
| `frontend/models/Payment.ts` | *Modificare.* Nuovo campo `kind`. |
| `frontend/lib/validation.ts` | *Modificare.* Schemi Zod di creazione e aggiornamento migrazione. |
| `frontend/lib/queries.ts` | *Modificare.* Migrazione pendente allegata a `SubscriptionView`; aggregati che filtrano `kind`. |
| `frontend/app/api/subscriptions/[id]/migration/route.ts` | *Creare.* POST: pianifica. |
| `frontend/app/api/migrations/[id]/route.ts` | *Creare.* PATCH: modifica. DELETE: annulla. |
| `frontend/app/api/migrations/[id]/execute/route.ts` | *Creare.* POST: esegue. |
| `frontend/components/MigrationForm.tsx` | *Creare.* Form di pianificazione con anteprima del saldo. |
| `frontend/components/MigrationBanner.tsx` | *Creare.* Banner sulla scheda abbonamento, con Esegui e Annulla. |
| `frontend/components/MigrationBadge.tsx` | *Creare.* Badge di avviso per elenco e dashboard. |
| `frontend/app/(protected)/abbonamenti/[id]/page.tsx` | *Modificare.* Banner e pulsante di pianificazione. |
| `frontend/app/(protected)/abbonamenti/page.tsx` | *Modificare.* Badge nella riga. |
| `frontend/app/(protected)/page.tsx` | *Modificare.* Migrazioni fra le cose da seguire. |

---

### Task 1: `lib/migration.ts` — il calcolo

**Files:**
- Create: `frontend/lib/migration.ts`
- Test: `.tmp/verifica-migration.mts` (script una tantum, non committato)

**Interfaces:**
- Consumes: da `@/lib/billing` → `PERIOD_MONTHS`, `addMonths`, `daysBetween`, `serviceQuota`, `totalDue`. Da `@/models/Subscription` → il tipo `Periodicity`.
- Produces:
  - `type MigrationCloseOld = "alla_decorrenza" | "a_scadenza"`
  - `type MigrationStatus = "pianificata" | "eseguita" | "annullata"`
  - `wholeMonthsBetween(from: Date, to: Date): number`
  - `creditMonths(effectiveDate: Date, oldNextDueDate: Date | null | undefined, closeOld: MigrationCloseOld): number`
  - `migrationBalance(input: MigrationBalanceInput): MigrationBalance`
  - `migrationAlert(input: MigrationAlertInput, now?: Date): MigrationAlert`

- [ ] **Step 1: Scrivere il modulo**

Creare `frontend/lib/migration.ts`:

```ts
import {
  DUE_SOON_DAYS,
  PERIOD_MONTHS,
  addMonths,
  daysBetween,
  serviceQuota,
  totalDue,
} from "@/lib/billing";
import type { Periodicity } from "@/models/Subscription";

/**
 * Calcolo della migrazione fra servizi.
 * Funzioni pure, `now` sempre passato: nessun accesso al database e nessuna
 * data implicita, esattamente come lib/billing.ts.
 */

export const MIGRATION_CLOSE_OLD = ["alla_decorrenza", "a_scadenza"] as const;
export type MigrationCloseOld = (typeof MIGRATION_CLOSE_OLD)[number];

export const MIGRATION_STATUSES = ["pianificata", "eseguita", "annullata"] as const;
export type MigrationStatus = (typeof MIGRATION_STATUSES)[number];

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Mesi interi che separano due date. Il mese iniziato non conta: è la regola
 * del team, un mese cominciato è pagato e finisce lì.
 */
export function wholeMonthsBetween(from: Date, to: Date): number {
  if (to.getTime() <= from.getTime()) return 0;
  let months = 0;
  while (addMonths(from, months + 1).getTime() <= to.getTime()) {
    months += 1;
  }
  return months;
}

/**
 * Mesi già pagati a cui il vecchio abbonamento rinuncia passando al nuovo.
 * Zero se arriva alla sua scadenza naturale: non si perde nulla, i due
 * servizi si accavallano e basta. Zero anche senza una scadenza nota, cioè
 * quando il vecchio abbonamento non ha mai ricevuto pagamenti.
 */
export function creditMonths(
  effectiveDate: Date,
  oldNextDueDate: Date | null | undefined,
  closeOld: MigrationCloseOld
): number {
  if (closeOld === "a_scadenza") return 0;
  if (!oldNextDueDate) return 0;
  return wholeMonthsBetween(effectiveDate, new Date(oldNextDueDate));
}

export interface MigrationBalanceInput {
  effectiveDate: Date;
  closeOld: MigrationCloseOld;
  /** Scadenza corrente del vecchio abbonamento, da computeSubscription. */
  oldNextDueDate: Date | null | undefined;
  oldMonthlyRate: number;
  /** Quanto è stato davvero incassato per il ciclo in corso del vecchio. */
  oldPaidForCurrentCycle: number;
  newMonthlyRate: number;
  newPeriodicity: Periodicity;
  donationSupplement?: number;
}

export interface MigrationBalance {
  creditMonths: number;
  /** Credito riconosciuto, mai superiore a quanto incassato. */
  creditAmount: number;
  /** Dovuto pieno per il primo ciclo del nuovo abbonamento. */
  newTotal: number;
  /** Positivo: da versare. Negativo: credito a favore, mai un rimborso. */
  saldo: number;
  /** Scomposizione mostrata in interfaccia. Somma sempre al saldo. */
  convertedMonths: number;
  convertedAmount: number;
  remainingMonths: number;
  remainingAmount: number;
  donationAmount: number;
}

/**
 * Saldo della migrazione e sua scomposizione.
 *
 * Il credito è il minore fra i mesi residui valorizzati alla tariffa del
 * vecchio servizio e quanto è stato davvero incassato per quel ciclo: si
 * sconta ciò che è entrato, mai di più.
 *
 * La scomposizione non è un secondo calcolo che potrebbe divergere dal
 * totale: `convertedAmount` è definito come il resto, quindi le tre voci
 * sommano al saldo per costruzione.
 */
export function migrationBalance(input: MigrationBalanceInput): MigrationBalance {
  const donation = input.donationSupplement ?? 0;
  const months = creditMonths(input.effectiveDate, input.oldNextDueDate, input.closeOld);
  const creditAmount = round2(
    Math.min(months * input.oldMonthlyRate, Math.max(0, input.oldPaidForCurrentCycle))
  );

  const cycleMonths = PERIOD_MONTHS[input.newPeriodicity];
  const quota = serviceQuota(input.newMonthlyRate, input.newPeriodicity);
  const newTotal = totalDue(input.newMonthlyRate, input.newPeriodicity, donation);

  const convertedMonths = Math.min(months, cycleMonths);
  const remainingMonths = cycleMonths - convertedMonths;
  const remainingAmount = round2(remainingMonths * input.newMonthlyRate);
  const convertedAmount = round2(quota - remainingAmount - creditAmount);

  return {
    creditMonths: months,
    creditAmount,
    newTotal,
    saldo: round2(convertedAmount + remainingAmount + donation),
    convertedMonths,
    convertedAmount,
    remainingMonths,
    remainingAmount,
    donationAmount: donation,
  };
}

export interface MigrationAlertInput {
  status: MigrationStatus;
  effectiveDate: Date;
  closeOld: MigrationCloseOld;
  /** Scadenza del vecchio abbonamento, per l'avviso "da cessare". */
  oldNextDueDate?: Date | null;
  /** Il vecchio abbonamento è ancora attivo? Serve solo dopo l'esecuzione. */
  oldStillActive?: boolean;
}

export type MigrationAlertKind = "imminente" | "in_ritardo" | "da_cessare";

export interface MigrationAlert {
  kind: MigrationAlertKind;
  /** Giorni di distanza, sempre positivo: il verso lo dice `kind`. */
  days: number;
  label: string;
}

/**
 * Avviso derivato, mai persistito: non esiste un campo "già avvisato".
 * Riusa DUE_SOON_DAYS di lib/billing.ts invece di introdurre una soglia
 * propria, così scadenze e migrazioni avvertono con lo stesso anticipo.
 */
export function migrationAlert(
  input: MigrationAlertInput,
  now: Date = new Date()
): MigrationAlert | null {
  if (input.status === "annullata") return null;

  if (input.status === "eseguita") {
    if (input.closeOld !== "a_scadenza" || !input.oldStillActive || !input.oldNextDueDate) {
      return null;
    }
    const late = daysBetween(new Date(input.oldNextDueDate), now);
    if (late < 0) return null;
    return {
      kind: "da_cessare",
      days: late,
      label: "Vecchio abbonamento scaduto, da cessare",
    };
  }

  const remaining = daysBetween(now, new Date(input.effectiveDate));
  if (remaining < 0) {
    return {
      kind: "in_ritardo",
      days: -remaining,
      label: `Migrazione in ritardo di ${-remaining} giorni`,
    };
  }
  if (remaining === 0) {
    return { kind: "imminente", days: 0, label: "Migrazione da eseguire oggi" };
  }
  if (remaining <= DUE_SOON_DAYS) {
    return {
      kind: "imminente",
      days: remaining,
      label: `Migrazione fra ${remaining} giorni`,
    };
  }
  return null;
}
```

- [ ] **Step 2: Scrivere lo script di verifica**


Creare `.tmp/verifica-migration.mts`. Node 24 fa type stripping, quindi il file `.mts` si lancia direttamente. L'import è per URL assoluto perché lo script sta fuori dal progetto Next e non ha l'alias `@/`:

```ts
import {
  creditMonths,
  migrationBalance,
  migrationAlert,
} from "file:///D:/DEVS/subsmate/frontend/lib/migration.ts";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures += 1;
    console.error(`FALLITO ${name}\n  atteso: ${JSON.stringify(expected)}\n  ottenuto: ${JSON.stringify(actual)}`);
  } else {
    console.log(`ok ${name}`);
  }
}

// Caso di riferimento della spec: Claude 20, ChatGPT 25, entrambi trimestrali,
// un mese residuo pagato per intero.
const marco = migrationBalance({
  effectiveDate: new Date(2026, 9, 18),
  closeOld: "alla_decorrenza",
  oldNextDueDate: new Date(2026, 10, 18),
  oldMonthlyRate: 20,
  oldPaidForCurrentCycle: 60,
  newMonthlyRate: 25,
  newPeriodicity: "quarterly",
});
check("saldo del caso di riferimento", marco.saldo, 55);
check("credito del caso di riferimento", marco.creditAmount, 20);
check("mesi convertiti", marco.convertedMonths, 1);
check("differenza sul mese convertito", marco.convertedAmount, 5);
check("mesi nuovi da aggiungere", marco.remainingAmount, 50);
check(
  "la scomposizione somma al saldo",
  marco.convertedAmount + marco.remainingAmount + marco.donationAmount,
  marco.saldo
);

// Review Focus 1: decorrenza dopo la scadenza del vecchio, cioè una pausa.
check(
  "pausa fra i due abbonamenti: nessun credito",
  creditMonths(new Date(2026, 11, 1), new Date(2026, 10, 18), "alla_decorrenza"),
  0
);

// Review Focus 2: vecchio abbonamento senza pagamenti, scadenza sconosciuta.
check(
  "scadenza nulla: nessun credito e nessun errore",
  creditMonths(new Date(2026, 9, 18), null, "alla_decorrenza"),
  0
);

// Review Focus 3: ciclo pagato solo in parte, il credito si ferma all'incassato.
const parziale = migrationBalance({
  effectiveDate: new Date(2026, 9, 18),
  closeOld: "alla_decorrenza",
  oldNextDueDate: new Date(2026, 10, 18),
  oldMonthlyRate: 20,
  oldPaidForCurrentCycle: 10,
  newMonthlyRate: 25,
  newPeriodicity: "quarterly",
});
check("credito limitato all'incassato", parziale.creditAmount, 10);
check("saldo con credito limitato", parziale.saldo, 65);

// Accavallamento volontario: il vecchio arriva a scadenza, nessun credito.
const accavallato = migrationBalance({
  effectiveDate: new Date(2026, 9, 1),
  closeOld: "a_scadenza",
  oldNextDueDate: new Date(2026, 10, 18),
  oldMonthlyRate: 20,
  oldPaidForCurrentCycle: 60,
  newMonthlyRate: 25,
  newPeriodicity: "quarterly",
});
check("accavallamento: nessun credito", accavallato.creditAmount, 0);
check("accavallamento: quota piena", accavallato.saldo, 75);

// Credito maggiore del ciclo nuovo: saldo negativo, credito a favore.
const eccedente = migrationBalance({
  effectiveDate: new Date(2026, 8, 18),
  closeOld: "alla_decorrenza",
  oldNextDueDate: new Date(2026, 10, 18),
  oldMonthlyRate: 20,
  oldPaidForCurrentCycle: 60,
  newMonthlyRate: 25,
  newPeriodicity: "monthly",
});
check("due mesi di credito riconosciuti", eccedente.creditMonths, 2);
check("saldo negativo come credito a favore", eccedente.saldo, -15);

// Il supplemento donazione entra nel saldo come voce propria.
const conDonazione = migrationBalance({
  effectiveDate: new Date(2026, 9, 18),
  closeOld: "alla_decorrenza",
  oldNextDueDate: new Date(2026, 10, 18),
  oldMonthlyRate: 20,
  oldPaidForCurrentCycle: 60,
  newMonthlyRate: 25,
  newPeriodicity: "quarterly",
  donationSupplement: 5,
});
check("donazione sommata al saldo", conDonazione.saldo, 60);
check("donazione come voce separata", conDonazione.donationAmount, 5);

// Avvisi.
const oggi = new Date(2026, 9, 10);
check(
  "avviso imminente entro quindici giorni",
  migrationAlert(
    { status: "pianificata", effectiveDate: new Date(2026, 9, 18), closeOld: "alla_decorrenza" },
    oggi
  )?.kind,
  "imminente"
);
check(
  "nessun avviso oltre quindici giorni",
  migrationAlert(
    { status: "pianificata", effectiveDate: new Date(2026, 11, 1), closeOld: "alla_decorrenza" },
    oggi
  ),
  null
);
check(
  "avviso di ritardo",
  migrationAlert(
    { status: "pianificata", effectiveDate: new Date(2026, 9, 7), closeOld: "alla_decorrenza" },
    oggi
  )?.label,
  "Migrazione in ritardo di 3 giorni"
);
check(
  "migrazione annullata non avvisa",
  migrationAlert(
    { status: "annullata", effectiveDate: new Date(2026, 9, 7), closeOld: "alla_decorrenza" },
    oggi
  ),
  null
);
check(
  "vecchio abbonamento da cessare dopo la scadenza",
  migrationAlert(
    {
      status: "eseguita",
      effectiveDate: new Date(2026, 8, 1),
      closeOld: "a_scadenza",
      oldNextDueDate: new Date(2026, 9, 5),
      oldStillActive: true,
    },
    oggi
  )?.kind,
  "da_cessare"
);

console.log(failures === 0 ? "\nTutti i controlli passano." : `\n${failures} controlli falliti.`);
process.exit(failures === 0 ? 0 : 1);
```

**Attenzione alle date:** i controlli usano i componenti locali (`new Date(2026, 9, 18)`, dove 9 è ottobre). Non usare `toISOString()` nei confronti: sposta la data di un giorno e ha già prodotto nove falsi fallimenti in una verifica precedente.

- [ ] **Step 3: Lanciare la verifica**

Dalla root del repo:

```bash
node .tmp/verifica-migration.mts
```

Atteso: `Tutti i controlli passano.` ed exit code 0. Se un controllo fallisce, correggere `lib/migration.ts`, non lo script, a meno che non sia lo script a sbagliare il caso.

- [ ] **Step 4: Typecheck e lint**

```bash
cd frontend && npx tsc --noEmit && npm run lint
```

Atteso: nessun output da entrambi.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/migration.ts
git commit -m "feat: calcolo del saldo di migrazione fra servizi

Funzioni pure: mesi di credito a mesi interi, saldo con scomposizione
che somma sempre al totale, avviso derivato che riusa DUE_SOON_DAYS.
Il credito non supera mai quanto davvero incassato per il ciclo.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Modelli e validazione

**Files:**
- Create: `frontend/models/Migration.ts`
- Modify: `frontend/models/Payment.ts`
- Modify: `frontend/lib/validation.ts`

**Interfaces:**
- Consumes: da `@/lib/migration` → `MIGRATION_CLOSE_OLD`, `MIGRATION_STATUSES`.
- Produces:
  - `Migration` (modello Mongoose), `MigrationDoc`
  - `PAYMENT_KINDS`, `PaymentKind` da `@/models/Payment`
  - `migrationCreateSchema`, `migrationUpdateSchema` da `@/lib/validation`

- [ ] **Step 1: Creare il modello**

Creare `frontend/models/Migration.ts`:

```ts
import { Schema, model, models, Types, type InferSchemaType, type Model } from "mongoose";
import { MIGRATION_CLOSE_OLD, MIGRATION_STATUSES } from "@/lib/migration";

/**
 * Passaggio programmato di una persona da un servizio a un altro.
 *
 * Il saldo NON è qui: è calcolabile, quindi si deriva a ogni lettura da
 * lib/migration.ts. Sul documento finiscono solo i due fatti che dopo
 * l'esecuzione non sarebbero più ricostruibili — il vecchio abbonamento
 * viene cessato e la tariffa del servizio può cambiare — allo stesso titolo
 * per cui Payment.amount è l'importo incassato e non la quota dovuta.
 */
const MigrationSchema = new Schema(
  {
    person: { type: Types.ObjectId, ref: "Person", required: true, index: true },
    fromSubscription: {
      type: Types.ObjectId,
      ref: "Subscription",
      required: true,
      index: true,
    },
    toService: { type: Types.ObjectId, ref: "Service", required: true },
    // Valorizzato all'esecuzione, quando l'abbonamento nuovo esiste davvero.
    toSubscription: { type: Types.ObjectId, ref: "Subscription", default: null },
    effectiveDate: { type: Date, required: true },
    // Distingue la chiusura anticipata dall'accavallamento volontario: è
    // questo campo, non la data, a dire se maturano mesi di credito.
    closeOld: {
      type: String,
      enum: MIGRATION_CLOSE_OLD,
      required: true,
      default: "alla_decorrenza",
    },
    status: {
      type: String,
      enum: MIGRATION_STATUSES,
      required: true,
      default: "pianificata",
    },
    creditMonths: { type: Number, min: 0, default: null },
    creditMonthlyRate: { type: Number, min: 0, default: null },
    notes: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

// Una sola migrazione pendente per abbonamento: due piani contemporanei si
// contraddirebbero in silenzio. Quelle eseguite o annullate restano quante
// ne servono, perché sono la storia dell'abbonamento.
MigrationSchema.index(
  { fromSubscription: 1 },
  { unique: true, partialFilterExpression: { status: "pianificata" } }
);

export type MigrationDoc = InferSchemaType<typeof MigrationSchema>;

export const Migration: Model<MigrationDoc> =
  (models.Migration as Model<MigrationDoc>) || model<MigrationDoc>("Migration", MigrationSchema);

export default Migration;
```

- [ ] **Step 2: Aggiungere `kind` al pagamento**

In `frontend/models/Payment.ts`, sotto la costante `PAYMENT_METHODS`, aggiungere:

```ts
export const PAYMENT_KINDS = ["incasso", "credito_migrazione"] as const;
export type PaymentKind = (typeof PAYMENT_KINDS)[number];
```

e dentro `PaymentSchema`, subito dopo il campo `method`:

```ts
    // "credito_migrazione" è denaro già incassato sul vecchio abbonamento e
    // riconosciuto come sconto sul primo ciclo del nuovo: chiude il ciclo
    // come un versamento, ma NON va sommato agli incassi, altrimenti si
    // conterebbe due volte.
    kind: { type: String, enum: PAYMENT_KINDS, required: true, default: "incasso" },
```

- [ ] **Step 3: Aggiungere gli schemi Zod**

In `frontend/lib/validation.ts`, dopo `paymentUpdateSchema`, aggiungere:

```ts
export const migrationCreateSchema = z.object({
  toService: objectId,
  effectiveDate: z.coerce.date(),
  closeOld: z.enum(MIGRATION_CLOSE_OLD).optional(),
  notes: z.string().optional(),
});

/** Su una migrazione pianificata si cambia tutto tranne l'abbonamento di partenza. */
export const migrationUpdateSchema = migrationCreateSchema.partial();
```

e in cima al file, accanto agli altri import:

```ts
import { MIGRATION_CLOSE_OLD } from "@/lib/migration";
```

infine, con gli altri tipi esportati in fondo:

```ts
export type MigrationInput = z.infer<typeof migrationCreateSchema>;
```

- [ ] **Step 4: Typecheck e lint**

```bash
cd frontend && npx tsc --noEmit && npm run lint
```

Atteso: nessun output.

- [ ] **Step 5: Verificare che l'indice parziale si crei davvero**

Creare `.tmp/verifica-indice-migration.mts` e lanciarlo dalla root. Punta a `subsmate_dev`, mai a `subsmate`:

```ts
import "dotenv/config";
import mongoose from "file:///D:/DEVS/subsmate/frontend/node_modules/mongoose/index.js";
import { readFileSync } from "node:fs";

const env = readFileSync("D:/DEVS/subsmate/frontend/.env.local", "utf8");
const uri = /^MONGODB_URI=(.*)$/m.exec(env)?.[1]?.trim();
const dbName = /^MONGODB_DB=(.*)$/m.exec(env)?.[1]?.trim();
if (!uri || !dbName) throw new Error("MONGODB_URI o MONGODB_DB assenti da .env.local");
if (dbName !== "subsmate_dev") throw new Error(`Atteso subsmate_dev, trovato ${dbName}`);

await mongoose.connect(uri, { dbName });
const { Migration } = await import("file:///D:/DEVS/subsmate/frontend/models/Migration.ts");
await Migration.syncIndexes();
console.log(await Migration.collection.indexes());
await mongoose.disconnect();
```

Atteso: fra gli indici compare una voce su `fromSubscription` con `unique: true` e `partialFilterExpression: { status: "pianificata" }`.

- [ ] **Step 6: Commit**

```bash
git add frontend/models/Migration.ts frontend/models/Payment.ts frontend/lib/validation.ts
git commit -m "feat: modello Migration e tipo di pagamento

La migrazione salva solo i fatti non ricostruibili dopo l'esecuzione.
Payment.kind distingue l'incasso dal credito di migrazione, che chiude
il ciclo senza essere denaro nuovo.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Gli aggregati non contano il credito come incasso

**Files:**
- Modify: `frontend/lib/queries.ts` (funzione `getDashboardData`)
- Modify: `frontend/app/(protected)/pagamenti/page.tsx`

**Interfaces:**
- Consumes: `PAYMENT_KINDS` da `@/models/Payment`.
- Produces: nulla di nuovo. Cambia solo il significato dei totali già esposti.

Questo task va **prima** dell'esecuzione (Task 6): quando il primo credito verrà scritto, i totali devono già saperlo escludere. Farlo dopo significa pubblicare numeri sbagliati nel frattempo.

- [ ] **Step 1: Filtrare l'aggregato della dashboard**

In `frontend/lib/queries.ts`, dentro `getDashboardData`, sostituire la pipeline delle donazioni con:

```ts
  // Il credito di migrazione è denaro già contato sul vecchio abbonamento:
  // chiude il ciclo del nuovo ma non è un incasso, e sommarlo qui lo
  // conterebbe due volte.
  const [donations] = await Payment.aggregate([
    { $match: { kind: { $ne: "credito_migrazione" } } },
    { $group: { _id: null, total: { $sum: "$donationAmount" }, collected: { $sum: "$amount" } } },
  ]);
```

`$ne` invece di `$eq: "incasso"` perché i pagamenti scritti prima di questo campo non hanno `kind` in documento: il default Mongoose vale alla scrittura, non retroattivamente.

- [ ] **Step 2: Filtrare i totali della pagina Pagamenti**

In `frontend/app/(protected)/pagamenti/page.tsx`, sostituire il calcolo dei due totali con:

```ts
  // Come in dashboard: i crediti di migrazione non sono denaro incassato.
  const incassi = allPayments.filter((payment) => payment.kind !== "credito_migrazione");
  const collected = incassi.reduce((sum, payment) => sum + payment.amount, 0);
  const donations = incassi.reduce((sum, payment) => sum + (payment.donationAmount ?? 0), 0);
```

Il contatore "Pagamenti registrati" resta su `allPayments.length`: le righe di credito si vedono nell'elenco, quindi vanno contate.

- [ ] **Step 3: Etichettare la riga di credito nell'elenco**

Nella stessa pagina, nella cella del metodo, sostituire `<Pill>{payment.method}</Pill>` con:

```tsx
                      <Td>
                        {payment.kind === "credito_migrazione" ? (
                          <Pill>Credito migrazione</Pill>
                        ) : (
                          <Pill>{payment.method}</Pill>
                        )}
                      </Td>
```

Nasconderla renderebbe inspiegabile il saldo del nuovo abbonamento.

- [ ] **Step 4: Typecheck e lint**

```bash
cd frontend && npx tsc --noEmit && npm run lint
```

Atteso: nessun output.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/queries.ts "frontend/app/(protected)/pagamenti/page.tsx"
git commit -m "fix: escludere i crediti di migrazione dagli incassi

Il credito è denaro già contato sul vecchio abbonamento: chiude il ciclo
del nuovo ma non è un incasso. Resta visibile nell'elenco, etichettato.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Letture — la migrazione arriva alle pagine

**Files:**
- Modify: `frontend/lib/queries.ts`

**Interfaces:**
- Consumes: `Migration` da `@/models/Migration`; `migrationAlert`, `migrationBalance` da `@/lib/migration`.
- Produces:
  - `interface MigrationView` con campi `_id`, `toService` (`{ _id, name, slug, monthlyRate, logo }` o `null`), `effectiveDate`, `closeOld`, `status`, `alert` (`MigrationAlert | null`), `balance` (`MigrationBalance | null`)
  - `SubscriptionView.migration: MigrationView | null`
  - `getMigration(id: string): Promise<MigrationView | null>`

- [ ] **Step 1: Estendere `SubscriptionView`**

In `frontend/lib/queries.ts`, aggiungere sopra `SubscriptionView`:

```ts
export interface MigrationView {
  _id: string;
  toService: {
    _id: string;
    name: string;
    slug: string;
    monthlyRate: number;
    logo: string | null;
  } | null;
  effectiveDate: Date;
  closeOld: MigrationCloseOld;
  status: MigrationStatus;
  /** Avviso derivato: null quando non c'è nulla da segnalare. */
  alert: MigrationAlert | null;
  /** Saldo ricalcolato a ogni lettura, mai lo snapshot salvato. */
  balance: MigrationBalance | null;
}
```

e dentro `SubscriptionView`, dopo `computed`:

```ts
  /** Migrazione pianificata o appena eseguita che riguarda questo abbonamento. */
  migration: MigrationView | null;
```

- [ ] **Step 2: Allegare la migrazione in `listSubscriptions`**

Sempre in `listSubscriptions`, dopo il blocco che costruisce `paymentsBySubscription`, aggiungere:

```ts
  // Una query sola per tutte le migrazioni che riguardano questi abbonamenti,
  // come per i pagamenti: niente una-query-per-riga.
  const migrations = await Migration.find({
    fromSubscription: { $in: subscriptions.map((sub) => sub._id) },
    status: { $ne: "annullata" },
  })
    .populate("toService", "name slug monthlyRate")
    .sort({ createdAt: -1 })
    .lean();

  const migrationsBySubscription = new Map<string, (typeof migrations)[number]>();
  for (const migration of migrations) {
    const key = String(migration.fromSubscription);
    // La più recente vince: le precedenti sono storia già chiusa.
    if (!migrationsBySubscription.has(key)) migrationsBySubscription.set(key, migration);
  }
```

- [ ] **Step 3: Calcolare avviso e saldo nel `map` finale**

Dentro il `return subscriptions.map(...)`, prima del `return` dell'oggetto, calcolare:

```ts
    const computed = computeSubscription(
      {
        monthlyRate: service?.monthlyRate ?? 0,
        periodicity: sub.periodicity,
        donationSupplement: sub.donationSupplement,
        onboardingStatus: sub.onboardingStatus,
        startDate: sub.startDate,
        lastPaymentDate: sub.lastPaymentDate,
        billingDayOfMonth: service?.billingDayOfMonth,
        payments: paymentsBySubscription.get(String(sub._id)) ?? [],
      },
      now
    );

    const raw = migrationsBySubscription.get(String(sub._id));
    const toService = raw?.toService as unknown as MigrationView["toService"];
    const migration: MigrationView | null = raw
      ? {
          _id: String(raw._id),
          toService: toService ? { ...toService, logo: serviceLogoFor(toService.slug) } : null,
          effectiveDate: raw.effectiveDate,
          closeOld: raw.closeOld,
          status: raw.status,
          alert: migrationAlert(
            {
              status: raw.status,
              effectiveDate: raw.effectiveDate,
              closeOld: raw.closeOld,
              oldNextDueDate: computed.nextDueDate,
              oldStillActive: sub.onboardingStatus === "attivo",
            },
            now
          ),
          balance:
            raw.status === "pianificata" && toService
              ? migrationBalance({
                  effectiveDate: raw.effectiveDate,
                  closeOld: raw.closeOld,
                  oldNextDueDate: computed.nextDueDate,
                  oldMonthlyRate: service?.monthlyRate ?? 0,
                  oldPaidForCurrentCycle: computed.paidForCurrentCycle,
                  newMonthlyRate: toService.monthlyRate,
                  newPeriodicity: sub.periodicity,
                  donationSupplement: sub.donationSupplement,
                })
              : null,
        }
      : null;
```

e sostituire l'oggetto restituito con:

```ts
    return {
      ...(sub as unknown as SubscriptionView),
      service: service ? { ...service, logo: serviceLogoFor(service.slug) } : null,
      computed,
      migration,
    };
```

`computeSubscription` ora si chiama una volta sola e il suo risultato serve anche alla migrazione: prima era inline dentro l'oggetto.

- [ ] **Step 4: Aggiungere `getMigration`**

In fondo a `frontend/lib/queries.ts`:

```ts
/** Singola migrazione, per le rotte che devono rispondere con lo stato aggiornato. */
export async function getMigration(id: string): Promise<MigrationView | null> {
  await connectToDatabase();
  const migration = await Migration.findById(id)
    .populate("toService", "name slug monthlyRate")
    .lean();
  if (!migration) return null;

  const [subscription] = await listSubscriptions({ _id: migration.fromSubscription });
  return subscription?.migration ?? null;
}
```

- [ ] **Step 5: Aggiungere gli import mancanti**

In cima a `frontend/lib/queries.ts`:

```ts
import { Migration } from "@/models/Migration";
import {
  migrationAlert,
  migrationBalance,
  type MigrationAlert,
  type MigrationBalance,
  type MigrationCloseOld,
  type MigrationStatus,
} from "@/lib/migration";
```

- [ ] **Step 6: Typecheck e lint**

```bash
cd frontend && npx tsc --noEmit && npm run lint
```

Atteso: nessun output. Se `tsc` segnala che `migration` manca in qualche punto che costruisce un `SubscriptionView` a mano, aggiungere `migration: null` lì.

- [ ] **Step 7: Commit**

```bash
git add frontend/lib/queries.ts
git commit -m "feat: migrazione allegata agli abbonamenti in lettura

Una query sola per tutte le migrazioni, avviso e saldo derivati a ogni
lettura. computeSubscription ora si chiama una volta e serve a entrambi.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Rotte di pianificazione, modifica e annullamento

**Files:**
- Create: `frontend/app/api/subscriptions/[id]/migration/route.ts`
- Create: `frontend/app/api/migrations/[id]/route.ts`
- Test: `.tmp/verifica-rotte-migration.mjs`

**Interfaces:**
- Consumes: `migrationCreateSchema`, `migrationUpdateSchema` da `@/lib/validation`; `getMigration` da `@/lib/queries`; `ok`, `fail`, `handleError`, `parseBody` da `@/lib/api`; `withAdmin` da `@/lib/requireAdmin`.
- Produces: `POST /api/subscriptions/:id/migration`, `PATCH /api/migrations/:id`, `DELETE /api/migrations/:id`.

- [ ] **Step 1: Rotta di pianificazione**

Creare `frontend/app/api/subscriptions/[id]/migration/route.ts`:

```ts
import { connectToDatabase } from "@/lib/mongodb";
import { Subscription } from "@/models/Subscription";
import { Migration } from "@/models/Migration";
import { migrationCreateSchema } from "@/lib/validation";
import { getMigration } from "@/lib/queries";
import { ok, fail, handleError, parseBody } from "@/lib/api";
import { withAdmin } from "@/lib/requireAdmin";

type Context = { params: Promise<{ id: string }> };

/**
 * POST /api/subscriptions/:id/migration — pianifica il passaggio a un altro
 * servizio. Non esegue nulla: crea il piano, che l'admin eseguirà a mano
 * quando l'avviso lo segnala. Il saldo non si salva, si ricalcola in lettura.
 */
async function handlePOST(request: Request, { params }: Context) {
  try {
    await connectToDatabase();
    const { id } = await params;

    const { data, error } = await parseBody(request, migrationCreateSchema);
    if (error) return error;

    const subscription = await Subscription.findById(id).lean();
    if (!subscription) return fail("Abbonamento non trovato", 404);
    if (subscription.onboardingStatus === "cessato") {
      return fail("Un abbonamento cessato non si migra: creane uno nuovo.", 409);
    }
    if (String(subscription.service) === data.toService) {
      return fail("Il servizio di destinazione coincide con quello attuale.", 422);
    }

    const pending = await Migration.findOne({
      fromSubscription: id,
      status: "pianificata",
    }).lean();
    if (pending) {
      return fail("Esiste già una migrazione pianificata per questo abbonamento.", 409);
    }

    const created = await Migration.create({
      person: subscription.person,
      fromSubscription: id,
      toService: data.toService,
      effectiveDate: data.effectiveDate,
      closeOld: data.closeOld ?? "alla_decorrenza",
      notes: data.notes ?? "",
    });

    return ok(await getMigration(String(created._id)), 201);
  } catch (err) {
    return handleError(err);
  }
}

export const POST = withAdmin(handlePOST);
```

- [ ] **Step 2: Rotta di modifica e annullamento**

Creare `frontend/app/api/migrations/[id]/route.ts`:

```ts
import { connectToDatabase } from "@/lib/mongodb";
import { Migration } from "@/models/Migration";
import { Subscription } from "@/models/Subscription";
import { migrationUpdateSchema } from "@/lib/validation";
import { getMigration } from "@/lib/queries";
import { ok, fail, handleError, parseBody } from "@/lib/api";
import { withAdmin } from "@/lib/requireAdmin";

type Context = { params: Promise<{ id: string }> };

/**
 * PATCH /api/migrations/:id — corregge una migrazione ancora pianificata.
 * Una già eseguita non si modifica: ha creato un abbonamento e scritto un
 * credito, quindi cambiarne i termini falsificherebbe fatti già accaduti.
 */
async function handlePATCH(request: Request, { params }: Context) {
  try {
    await connectToDatabase();
    const { id } = await params;

    const { data, error } = await parseBody(request, migrationUpdateSchema);
    if (error) return error;

    const migration = await Migration.findById(id).lean();
    if (!migration) return fail("Migrazione non trovata", 404);
    if (migration.status !== "pianificata") {
      return fail("Solo una migrazione pianificata si può modificare.", 409);
    }

    if (data.toService) {
      const subscription = await Subscription.findById(migration.fromSubscription).lean();
      if (subscription && String(subscription.service) === data.toService) {
        return fail("Il servizio di destinazione coincide con quello attuale.", 422);
      }
    }

    const changes: Record<string, unknown> = {};
    if (data.toService !== undefined) changes.toService = data.toService;
    if (data.effectiveDate !== undefined) changes.effectiveDate = data.effectiveDate;
    if (data.closeOld !== undefined) changes.closeOld = data.closeOld;
    if (data.notes !== undefined) changes.notes = data.notes;

    await Migration.findByIdAndUpdate(id, changes, { runValidators: true });
    return ok(await getMigration(id));
  } catch (err) {
    return handleError(err);
  }
}

/**
 * DELETE /api/migrations/:id — annulla il piano. Non cancella il documento:
 * lo stato "annullata" resta nella storia dell'abbonamento, e l'indice unico
 * parziale lo ignora, quindi se ne può pianificare subito un'altra.
 */
async function handleDELETE(_request: Request, { params }: Context) {
  try {
    await connectToDatabase();
    const { id } = await params;

    const migration = await Migration.findById(id).lean();
    if (!migration) return fail("Migrazione non trovata", 404);
    if (migration.status === "eseguita") {
      return fail("Una migrazione eseguita non si annulla.", 409);
    }

    await Migration.findByIdAndUpdate(id, { status: "annullata" });
    return ok({ annullata: true });
  } catch (err) {
    return handleError(err);
  }
}

export const PATCH = withAdmin(handlePATCH);
export const DELETE = withAdmin(handleDELETE);
```

- [ ] **Step 3: Verificare che ogni rotta sia protetta**

```bash
cd frontend && grep -rLn "withAdmin" app/api --include=route.ts | grep -v auth/
```

Atteso: nessun output.

- [ ] **Step 4: Typecheck e lint**

```bash
cd frontend && npx tsc --noEmit && npm run lint
```

Atteso: nessun output.

- [ ] **Step 5: Provare le rotte via HTTP**

Avviare il dev server e **controllare che sia sulla 3000**: se la porta è occupata Next riparte sulla 3001 senza fermarsi, e si finisce a interrogare il server vecchio con la configurazione vecchia.

```bash
cd frontend && npm run dev
```

In un altro terminale, creare `.tmp/verifica-rotte-migration.mjs` e lanciarlo dalla root:

```js
import { readFileSync } from "node:fs";
import { SignJWT } from "file:///D:/DEVS/subsmate/frontend/node_modules/jose/dist/node/esm/index.js";

const env = readFileSync("D:/DEVS/subsmate/frontend/.env.local", "utf8");
const secret = /^AUTH_SECRET=(.*)$/m.exec(env)?.[1]?.trim();
const adminId = process.argv[2];
const subscriptionId = process.argv[3];
const toService = process.argv[4];
if (!secret || !adminId || !subscriptionId || !toService) {
  throw new Error("Uso: node .tmp/verifica-rotte-migration.mjs <adminId> <subscriptionId> <toServiceId>");
}

const token = await new SignJWT({ sub: adminId })
  .setProtectedHeader({ alg: "HS256" })
  .setIssuedAt()
  .setExpirationTime("1h")
  .sign(new TextEncoder().encode(secret));

const headers = { "content-type": "application/json", cookie: `subsmate_session=${token}` };
const base = "http://localhost:3000";

async function call(method, path, body) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json().catch(() => null);
  console.log(method, path, response.status, JSON.stringify(json).slice(0, 300));
  return { status: response.status, json };
}

const created = await call("POST", `/api/subscriptions/${subscriptionId}/migration`, {
  toService,
  effectiveDate: "2026-11-18",
  closeOld: "alla_decorrenza",
});
const migrationId = created.json?.data?._id;

await call("POST", `/api/subscriptions/${subscriptionId}/migration`, {
  toService,
  effectiveDate: "2026-11-18",
});
console.log("  ↑ atteso 409: esiste già una migrazione pianificata");

await call("PATCH", `/api/migrations/${migrationId}`, { effectiveDate: "2026-12-18" });
await call("DELETE", `/api/migrations/${migrationId}`);
await call("PATCH", `/api/migrations/${migrationId}`, { effectiveDate: "2027-01-18" });
console.log("  ↑ atteso 409: annullata, non più modificabile");
```

Il nome del cookie va letto da `frontend/lib/session-token.ts`; se differisce da `subsmate_session`, correggerlo nello script. Gli identificativi si prendono da Mongo su `subsmate_dev`.

Atteso: 201, 409, 200, 200, 409.

- [ ] **Step 6: Fermare il dev server**

Su Windows `pkill` non chiude il processo:

```bash
netstat -ano | grep ":3000.*LISTENING"
```

poi, con il pid trovato, in PowerShell: `Stop-Process -Id <pid> -Force`.

- [ ] **Step 7: Commit**

```bash
git add "frontend/app/api/subscriptions/[id]/migration" "frontend/app/api/migrations"
git commit -m "feat: rotte di pianificazione e annullamento della migrazione

Una sola migrazione pendente per abbonamento. L'annullamento cambia
stato invece di cancellare, così resta la storia e l'indice parziale
lascia pianificarne un'altra.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Esecuzione

**Files:**
- Create: `frontend/app/api/migrations/[id]/execute/route.ts`
- Test: `.tmp/verifica-esecuzione-migration.mjs`

**Interfaces:**
- Consumes: `migrationBalance` da `@/lib/migration`; `computeSubscription`, `coveredPeriod` da `@/lib/billing`; `getMigration` da `@/lib/queries`.
- Produces: `POST /api/migrations/:id/execute`.

- [ ] **Step 1: Scrivere la rotta**

Creare `frontend/app/api/migrations/[id]/execute/route.ts`:

```ts
import { connectToDatabase } from "@/lib/mongodb";
import { Migration } from "@/models/Migration";
import { Subscription } from "@/models/Subscription";
import { Service } from "@/models/Service";
import { Payment } from "@/models/Payment";
import { computeSubscription, coveredPeriod } from "@/lib/billing";
import { migrationBalance } from "@/lib/migration";
import { getMigration } from "@/lib/queries";
import { ok, fail, handleError } from "@/lib/api";
import { withAdmin } from "@/lib/requireAdmin";

type Context = { params: Promise<{ id: string }> };

/**
 * POST /api/migrations/:id/execute — esegue il passaggio.
 *
 * Non c'è uno scheduler: il repo non ha job in background e Vercel Cron
 * sarebbe infrastruttura nuova per una funzione sola. L'app avvisa, l'admin
 * esegue, e il momento dell'esecuzione resta un fatto registrato.
 *
 * Il credito diventa un Payment con kind "credito_migrazione" sul nuovo
 * abbonamento: così `outstanding` scende da solo attraverso paidForCycle,
 * senza toccare il motore di calcolo. Non è un incasso, e gli aggregati di
 * denaro lo escludono.
 */
async function handlePOST(_request: Request, { params }: Context) {
  try {
    await connectToDatabase();
    const { id } = await params;

    const migration = await Migration.findById(id).lean();
    if (!migration) return fail("Migrazione non trovata", 404);
    if (migration.status !== "pianificata") {
      return fail("Questa migrazione è già stata eseguita o annullata.", 409);
    }

    const oldSubscription = await Subscription.findById(migration.fromSubscription).lean();
    if (!oldSubscription) return fail("Abbonamento di partenza non trovato", 404);

    // L'indice unico persona × servizio fallirebbe con un 11000 illeggibile:
    // meglio dirlo prima, con il nome del problema.
    const existing = await Subscription.findOne({
      person: migration.person,
      service: migration.toService,
    }).lean();
    if (existing) {
      return fail(
        "Questa persona ha già un abbonamento sul servizio di destinazione.",
        409
      );
    }

    const [oldService, newService] = await Promise.all([
      Service.findById(oldSubscription.service).lean(),
      Service.findById(migration.toService).lean(),
    ]);
    if (!newService) return fail("Servizio di destinazione non trovato", 404);

    const oldPayments = await Payment.find(
      { subscription: oldSubscription._id },
      { amount: 1, periodEnd: 1 }
    ).lean();

    const now = new Date();
    const oldComputed = computeSubscription(
      {
        monthlyRate: oldService?.monthlyRate ?? 0,
        periodicity: oldSubscription.periodicity,
        donationSupplement: oldSubscription.donationSupplement,
        onboardingStatus: oldSubscription.onboardingStatus,
        startDate: oldSubscription.startDate,
        lastPaymentDate: oldSubscription.lastPaymentDate,
        billingDayOfMonth: oldService?.billingDayOfMonth,
        payments: oldPayments.map((payment) => ({
          amount: payment.amount,
          periodEnd: payment.periodEnd ?? null,
        })),
      },
      now
    );

    const balance = migrationBalance({
      effectiveDate: new Date(migration.effectiveDate),
      closeOld: migration.closeOld,
      oldNextDueDate: oldComputed.nextDueDate,
      oldMonthlyRate: oldService?.monthlyRate ?? 0,
      oldPaidForCurrentCycle: oldComputed.paidForCurrentCycle,
      newMonthlyRate: newService.monthlyRate,
      newPeriodicity: oldSubscription.periodicity,
      donationSupplement: oldSubscription.donationSupplement,
    });

    const newSubscription = await Subscription.create({
      person: migration.person,
      service: migration.toService,
      periodicity: oldSubscription.periodicity,
      donationSupplement: oldSubscription.donationSupplement,
      onboardingStatus: "attivo",
      startDate: migration.effectiveDate,
      notes: `Migrazione da ${oldService?.name ?? "servizio precedente"}`,
    });

    // Il credito chiude parte del primo ciclo: il periodo coperto si calcola
    // come per un versamento normale, altrimenti paidForCycle non lo
    // riconoscerebbe come appartenente al ciclo corrente.
    if (balance.creditAmount > 0) {
      const { periodStart, periodEnd } = coveredPeriod(
        new Date(migration.effectiveDate),
        oldSubscription.periodicity,
        newService.billingDayOfMonth
      );
      await Payment.create({
        subscription: newSubscription._id,
        person: migration.person,
        amount: balance.creditAmount,
        donationAmount: 0,
        paidAt: migration.effectiveDate,
        method: "altro",
        kind: "credito_migrazione",
        periodStart,
        periodEnd,
        notes: `Credito da ${oldService?.name ?? "servizio precedente"}: ${balance.creditMonths} mesi`,
      });
    }

    await Migration.findByIdAndUpdate(id, {
      status: "eseguita",
      toSubscription: newSubscription._id,
      creditMonths: balance.creditMonths,
      creditMonthlyRate: oldService?.monthlyRate ?? 0,
    });

    if (migration.closeOld === "alla_decorrenza") {
      await Subscription.findByIdAndUpdate(oldSubscription._id, {
        onboardingStatus: "cessato",
      });
    }

    return ok({
      migration: await getMigration(id),
      subscription: String(newSubscription._id),
      balance,
    });
  } catch (err) {
    return handleError(err);
  }
}

export const POST = withAdmin(handlePOST);
```

**Nota:** il `Payment` di credito non aggiorna `lastPaymentDate` del nuovo abbonamento. È voluto: farlo sposterebbe in avanti la scadenza di un ciclo che nessuno ha ancora pagato in denaro.

- [ ] **Step 2: Verificare che la rotta sia protetta**

```bash
cd frontend && grep -rLn "withAdmin" app/api --include=route.ts | grep -v auth/
```

Atteso: nessun output.

- [ ] **Step 3: Typecheck e lint**

```bash
cd frontend && npx tsc --noEmit && npm run lint
```

Atteso: nessun output.

- [ ] **Step 4: Provare l'esecuzione via HTTP**

Con il dev server sulla 3000, creare `.tmp/verifica-esecuzione-migration.mjs` e lanciarlo dalla root:

```js
import { readFileSync } from "node:fs";
import { SignJWT } from "file:///D:/DEVS/subsmate/frontend/node_modules/jose/dist/node/esm/index.js";

const env = readFileSync("D:/DEVS/subsmate/frontend/.env.local", "utf8");
const secret = /^AUTH_SECRET=(.*)$/m.exec(env)?.[1]?.trim();
const [, , adminId, subscriptionId, toService] = process.argv;
if (!secret || !adminId || !subscriptionId || !toService) {
  throw new Error("Uso: node .tmp/verifica-esecuzione-migration.mjs <adminId> <subscriptionId> <toServiceId>");
}

const token = await new SignJWT({ sub: adminId })
  .setProtectedHeader({ alg: "HS256" })
  .setIssuedAt()
  .setExpirationTime("1h")
  .sign(new TextEncoder().encode(secret));

const headers = { "content-type": "application/json", cookie: `subsmate_session=${token}` };

async function call(method, path, body) {
  const response = await fetch(`http://localhost:3000${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json().catch(() => null);
  console.log(method, path, response.status, JSON.stringify(json).slice(0, 400));
  return { status: response.status, json };
}

const created = await call("POST", `/api/subscriptions/${subscriptionId}/migration`, {
  toService,
  effectiveDate: "2026-11-18",
  closeOld: "alla_decorrenza",
});
const migrationId = created.json?.data?._id;

const executed = await call("POST", `/api/migrations/${migrationId}/execute`);
console.log("  saldo:", executed.json?.data?.balance?.saldo);

// Review Focus 5: la seconda esecuzione non deve creare nulla.
await call("POST", `/api/migrations/${migrationId}/execute`);
console.log("  ↑ atteso 409: già eseguita");

// Review Focus 4: ora la persona ha l'abbonamento sul servizio di destinazione,
// quindi una nuova migrazione verso lo stesso servizio non è eseguibile.
const doppia = await call("POST", `/api/subscriptions/${subscriptionId}/migration`, {
  toService,
  effectiveDate: "2026-12-18",
});
await call("POST", `/api/migrations/${doppia.json?.data?._id}/execute`);
console.log("  ↑ atteso 409 con messaggio leggibile, non errore Mongo 11000");
```

Atteso: 201, 200 con un saldo coerente con la spec, 409, 201, 409. Nel database `subsmate_dev` devono esserci **un solo** nuovo abbonamento e **un solo** pagamento con `kind: "credito_migrazione"`.

- [ ] **Step 5: Controllare a mano il conteggio sul database**

Contare i documenti creati dalla prova, per escludere che la seconda esecuzione abbia
scritto doppioni. Creare `.tmp/conta-migrazione.mts` e lanciarlo dalla root:

```ts
import { readFileSync } from "node:fs";
import mongoose from "file:///D:/DEVS/subsmate/frontend/node_modules/mongoose/index.js";

const env = readFileSync("D:/DEVS/subsmate/frontend/.env.local", "utf8");
const uri = /^MONGODB_URI=(.*)$/m.exec(env)?.[1]?.trim();
const dbName = /^MONGODB_DB=(.*)$/m.exec(env)?.[1]?.trim();
if (!uri || dbName !== "subsmate_dev") throw new Error(`Atteso subsmate_dev, trovato ${dbName}`);

await mongoose.connect(uri, { dbName });
const db = mongoose.connection.db;
const personId = process.argv[2];
const serviceId = process.argv[3];

console.log(
  "abbonamenti sul servizio di destinazione:",
  await db.collection("subscriptions").countDocuments({
    person: new mongoose.Types.ObjectId(personId),
    service: new mongoose.Types.ObjectId(serviceId),
  })
);
console.log(
  "crediti di migrazione:",
  await db.collection("payments").countDocuments({
    person: new mongoose.Types.ObjectId(personId),
    kind: "credito_migrazione",
  })
);
await mongoose.disconnect();
```

Atteso: **1** e **1**. Se esce 2, l'esecuzione non sta bloccando la ripetizione e il
Task 6 non è finito.

Poi ripulire i dati di prova da `subsmate_dev`: l'abbonamento nuovo, il pagamento di
credito e le due migrazioni.

- [ ] **Step 6: Fermare il dev server e committare**

```bash
git add "frontend/app/api/migrations"
git commit -m "feat: esecuzione della migrazione

Crea il nuovo abbonamento, congela i fatti sulla migrazione e scrive il
credito come Payment dedicato, così outstanding scende senza toccare il
motore di calcolo. Conflitti e doppie esecuzioni rispondono 409.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Form di pianificazione con anteprima del saldo

**Files:**
- Create: `frontend/components/MigrationForm.tsx`
- Modify: `frontend/app/(protected)/abbonamenti/[id]/page.tsx`

**Interfaces:**
- Consumes: `migrationBalance`, `type MigrationCloseOld` da `@/lib/migration`; `Field`, `TextInput`, `Select`, `ErrorMessage`, `submitJson` da `@/components/form`; `buttonPrimary` da `@/components/ui`; `formatEUR`, `toDateInputValue` da `@/lib/billing`; `Modal` da `@/components/Modal`.
- Produces: `MigrationForm`, `MigrationServiceOption`, `PlanMigrationButton`.

- [ ] **Step 1: Scrivere il form**

Creare `frontend/components/MigrationForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { buttonPrimary } from "@/components/ui";
import { Field, TextInput, Select, ErrorMessage, submitJson } from "@/components/form";
import { migrationBalance, type MigrationCloseOld } from "@/lib/migration";
import { formatEUR, toDateInputValue } from "@/lib/billing";
import type { Periodicity } from "@/models/Subscription";

/**
 * Pianificazione del passaggio a un altro servizio.
 *
 * L'anteprima del saldo si aggiorna mentre si sceglie: pianificare senza
 * vedere il numero è metà della funzione. Il calcolo è la stessa funzione
 * pura che gira sul server, quindi anteprima e saldo definitivo non possono
 * divergere.
 */

export interface MigrationServiceOption {
  _id: string;
  name: string;
  monthlyRate: number;
}

export function MigrationForm({
  subscriptionId,
  services,
  periodicity,
  donationSupplement,
  oldMonthlyRate,
  oldNextDueDate,
  oldPaidForCurrentCycle,
  onSuccess,
}: {
  subscriptionId: string;
  /** Servizi attivi diversi da quello attuale. */
  services: MigrationServiceOption[];
  periodicity: Periodicity;
  donationSupplement: number;
  oldMonthlyRate: number;
  /** ISO, o null se l'abbonamento non ha ancora una scadenza. */
  oldNextDueDate: string | null;
  oldPaidForCurrentCycle: number;
  onSuccess?: (message: string) => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toService, setToService] = useState(services[0]?._id ?? "");
  const [effectiveDate, setEffectiveDate] = useState(
    oldNextDueDate ? toDateInputValue(new Date(oldNextDueDate)) : toDateInputValue(new Date())
  );
  const [closeOld, setCloseOld] = useState<MigrationCloseOld>("alla_decorrenza");

  const target = services.find((service) => service._id === toService);
  const balance = target
    ? migrationBalance({
        effectiveDate: new Date(`${effectiveDate}T00:00:00`),
        closeOld,
        oldNextDueDate: oldNextDueDate ? new Date(oldNextDueDate) : null,
        oldMonthlyRate,
        oldPaidForCurrentCycle,
        newMonthlyRate: target.monthlyRate,
        newPeriodicity: periodicity,
        donationSupplement,
      })
    : null;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!toService) {
      setError("Scegli il servizio di destinazione.");
      return;
    }
    setPending(true);
    setError(null);

    const result = await submitJson(
      `/api/subscriptions/${subscriptionId}/migration`,
      "POST",
      { toService, effectiveDate, closeOld },
      "Pianificazione non riuscita. Riprova."
    );

    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (onSuccess) onSuccess("Migrazione pianificata");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nuovo servizio">
          <Select
            name="toService"
            value={toService}
            onChange={(event) => setToService(event.target.value)}
          >
            {services.map((service) => (
              <option key={service._id} value={service._id}>
                {service.name} — {formatEUR(service.monthlyRate)}/mese
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Decorrenza" hint="Quando parte il nuovo abbonamento">
          <TextInput
            type="date"
            name="effectiveDate"
            value={effectiveDate}
            onChange={(event) => setEffectiveDate(event.target.value)}
            required
          />
        </Field>

        <div className="sm:col-span-2">
          <Field label="Cosa succede all'abbonamento attuale">
            <Select
              name="closeOld"
              value={closeOld}
              onChange={(event) => setCloseOld(event.target.value as MigrationCloseOld)}
            >
              <option value="alla_decorrenza">
                Cessa alla decorrenza — i mesi pagati e non goduti fanno credito
              </option>
              <option value="a_scadenza">
                Resta attivo fino alla sua scadenza — nessun credito, i servizi si accavallano
              </option>
            </Select>
          </Field>
        </div>
      </div>

      {balance ? (
        <div className="rounded-[var(--radius)] border border-[var(--border)] px-4 py-3 text-sm">
          <table className="w-full">
            <tbody>
              {balance.convertedMonths > 0 ? (
                <tr>
                  <td className="py-0.5 text-[var(--ink-muted)]">
                    Mesi coperti dal credito ({balance.convertedMonths})
                  </td>
                  <td className="py-0.5 text-right tnum">{formatEUR(balance.convertedAmount)}</td>
                </tr>
              ) : null}
              <tr>
                <td className="py-0.5 text-[var(--ink-muted)]">
                  Mesi da aggiungere ({balance.remainingMonths})
                </td>
                <td className="py-0.5 text-right tnum">{formatEUR(balance.remainingAmount)}</td>
              </tr>
              {balance.donationAmount > 0 ? (
                <tr>
                  <td className="py-0.5 text-[var(--ink-muted)]">Supplemento donazione</td>
                  <td className="py-0.5 text-right tnum">{formatEUR(balance.donationAmount)}</td>
                </tr>
              ) : null}
              <tr className="border-t border-[var(--border)]">
                <td className="pt-1.5 font-medium">
                  {balance.saldo >= 0 ? "Saldo da versare" : "Credito a favore"}
                </td>
                <td className="pt-1.5 text-right font-medium tnum">
                  {formatEUR(Math.abs(balance.saldo))}
                </td>
              </tr>
            </tbody>
          </table>
          {balance.saldo < 0 ? (
            <p className="mt-2 text-xs text-[var(--ink-muted)]">
              Il credito supera il primo ciclo: si scala dal ciclo successivo, non si rimborsa.
            </p>
          ) : null}
        </div>
      ) : null}

      {error ? <ErrorMessage>{error}</ErrorMessage> : null}

      <button type="submit" disabled={pending} className={buttonPrimary}>
        {pending ? "Pianificazione in corso" : "Pianifica migrazione"}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Aggiungere il pulsante che lo apre**

In fondo allo stesso file:

```tsx
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { buttonSecondary } from "@/components/ui";

export function PlanMigrationButton(
  props: Omit<Parameters<typeof MigrationForm>[0], "onSuccess">
) {
  const [open, setOpen] = useState(false);
  const showToast = useToast();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={buttonSecondary}
        disabled={props.services.length === 0}
        title={props.services.length === 0 ? "Non ci sono altri servizi attivi" : undefined}
      >
        Pianifica migrazione
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Pianifica migrazione">
        <MigrationForm
          {...props}
          onSuccess={(message) => {
            setOpen(false);
            showToast(message);
          }}
        />
      </Modal>
    </>
  );
}
```

Gli `import` vanno spostati in cima al file, accanto agli altri: qui sono elencati solo per dire quali servono.

- [ ] **Step 3: Collegarlo alla scheda abbonamento**

In `frontend/app/(protected)/abbonamenti/[id]/page.tsx`, leggere i servizi attivi con `listServices()` e passare il pulsante nell'intestazione della pagina, escludendo il servizio corrente e quelli non attivi:

```tsx
  const services = await listServices();
  const migrationTargets = services
    .filter((service) => service.active && String(service._id) !== String(sub.service?._id))
    .map((service) => ({
      _id: String(service._id),
      name: service.name,
      monthlyRate: service.monthlyRate,
    }));
```

e nel JSX, dove stanno già le azioni della scheda:

```tsx
        <PlanMigrationButton
          subscriptionId={String(sub._id)}
          services={migrationTargets}
          periodicity={sub.periodicity}
          donationSupplement={sub.donationSupplement}
          oldMonthlyRate={sub.service?.monthlyRate ?? 0}
          oldNextDueDate={sub.computed.nextDueDate?.toISOString() ?? null}
          oldPaidForCurrentCycle={sub.computed.paidForCurrentCycle}
        />
```

Il pulsante non compare se esiste già una migrazione pianificata: avvolgerlo in `{!sub.migration || sub.migration.status !== "pianificata" ? ( ... ) : null}`.

- [ ] **Step 4: Typecheck e lint**

```bash
cd frontend && npx tsc --noEmit && npm run lint
```

Atteso: nessun output.

- [ ] **Step 5: Prova manuale in browser**

Con il dev server sulla 3000, aprire la scheda di un abbonamento con almeno un pagamento registrato, premere «Pianifica migrazione» e verificare che:

1. cambiando servizio di destinazione il saldo si aggiorni;
2. cambiando la decorrenza il numero dei mesi coperti cambi;
3. scegliendo «Resta attivo fino alla sua scadenza» il credito sparisca e il saldo salga alla quota piena;
4. i numeri coincidano con quelli dello script del Task 1 a parità di dati.

- [ ] **Step 6: Commit**

```bash
git add frontend/components/MigrationForm.tsx "frontend/app/(protected)/abbonamenti/[id]/page.tsx"
git commit -m "feat: form di pianificazione con anteprima del saldo

L'anteprima usa la stessa funzione pura del server, quindi non può
divergere dal saldo definitivo.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Avvisi in scheda, elenco e dashboard

**Files:**
- Create: `frontend/components/MigrationBanner.tsx`
- Create: `frontend/components/MigrationBadge.tsx`
- Modify: `frontend/app/(protected)/abbonamenti/[id]/page.tsx`
- Modify: `frontend/app/(protected)/abbonamenti/page.tsx`
- Modify: `frontend/app/(protected)/page.tsx`

**Interfaces:**
- Consumes: `MigrationView` da `@/lib/queries`; `formatDate`, `formatEUR` da `@/lib/billing`.
- Produces: `MigrationBanner`, `MigrationBadge`.

- [ ] **Step 1: Il badge**

Creare `frontend/components/MigrationBadge.tsx`:

```tsx
import type { MigrationAlert } from "@/lib/migration";

/**
 * Avviso compatto per le righe di elenco e la dashboard.
 *
 * Usa i colori di stato perché quello che segnala è uno stato vero, non una
 * decorazione: le brand guidelines vietano di riusarli per bottoni e link,
 * non per gli stati.
 */
export function MigrationBadge({ alert }: { alert: MigrationAlert | null }) {
  if (!alert) return null;
  const color = alert.kind === "in_ritardo" ? "var(--status-critical)" : "var(--status-warn)";
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ color, border: `1px solid ${color}` }}
    >
      {alert.label}
    </span>
  );
}
```

Verificare in `frontend/app/globals.css` i nomi esatti dei token di stato e correggerli qui se differiscono da `--status-critical` e `--status-warn`.

- [ ] **Step 2: Il banner**

Creare `frontend/components/MigrationBanner.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { buttonPrimary, buttonSecondary } from "@/components/ui";
import { formatDate, formatEUR } from "@/lib/billing";
import type { MigrationView } from "@/lib/queries";

/**
 * Banner sulla scheda dell'abbonamento: dice cosa è pianificato, quanto
 * costa e permette di eseguire o annullare. L'esecuzione è manuale perché
 * non esiste uno scheduler, quindi questo è l'unico punto in cui la
 * migrazione può davvero scattare.
 */
export function MigrationBanner({ migration }: { migration: MigrationView }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const showToast = useToast();

  if (migration.status !== "pianificata") return null;

  async function execute() {
    setPending(true);
    const response = await fetch(`/api/migrations/${migration._id}/execute`, {
      method: "POST",
    });
    setPending(false);
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      showToast(body?.error ?? "Esecuzione non riuscita");
      return;
    }
    showToast("Migrazione eseguita");
    router.refresh();
  }

  async function cancel() {
    const response = await fetch(`/api/migrations/${migration._id}`, { method: "DELETE" });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.error ?? "Annullamento non riuscito");
    }
    setConfirmOpen(false);
    showToast("Migrazione annullata");
    router.refresh();
  }

  return (
    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
      <p className="text-sm font-medium">
        Passaggio a {migration.toService?.name ?? "servizio rimosso"} dal{" "}
        <span className="tnum">{formatDate(migration.effectiveDate)}</span>
      </p>
      <p className="mt-1 text-sm text-[var(--ink-muted)]">
        {migration.closeOld === "alla_decorrenza"
          ? "L'abbonamento attuale cessa alla decorrenza."
          : "L'abbonamento attuale resta attivo fino alla sua scadenza."}
        {migration.balance
          ? migration.balance.saldo >= 0
            ? ` Saldo da versare ${formatEUR(migration.balance.saldo)}.`
            : ` Credito a favore ${formatEUR(Math.abs(migration.balance.saldo))}.`
          : null}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={execute} disabled={pending} className={buttonPrimary}>
          {pending ? "Esecuzione in corso" : "Esegui migrazione"}
        </button>
        <button type="button" onClick={() => setConfirmOpen(true)} className={buttonSecondary}>
          Annulla migrazione
        </button>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Annullare la migrazione?"
        message={`Il passaggio a ${migration.toService?.name ?? "quel servizio"} non verrà eseguito. L'abbonamento attuale resta com'è, e potrai pianificarne un'altra.`}
        confirmLabel="Annulla migrazione"
        onConfirm={cancel}
      />
    </div>
  );
}
```

- [ ] **Step 3: Montarli nelle pagine**

In `frontend/app/(protected)/abbonamenti/[id]/page.tsx`, sopra le card dei dati:

```tsx
      {sub.migration ? <MigrationBanner migration={sub.migration} /> : null}
```

In `frontend/app/(protected)/abbonamenti/page.tsx`, nella cella del servizio di ogni riga, sotto il nome:

```tsx
                        <MigrationBadge alert={sub.migration?.alert ?? null} />
```

In `frontend/app/(protected)/page.tsx`, nella sezione delle cose da seguire, aggiungere le migrazioni che hanno un avviso:

```tsx
  const conMigrazione = subscriptions.filter((sub) => sub.migration?.alert);
```

e renderizzarle con lo stesso stile delle righe già presenti, mostrando persona, servizio di destinazione e `sub.migration.alert.label`.

- [ ] **Step 4: Typecheck e lint**

```bash
cd frontend && npx tsc --noEmit && npm run lint
```

Atteso: nessun output.

- [ ] **Step 5: Prova manuale in browser**

Con il dev server sulla 3000 e una migrazione pianificata su `subsmate_dev`:

1. con decorrenza fra 8 giorni, il badge compare in elenco e la riga in dashboard;
2. con decorrenza fra 40 giorni, non compare nulla — la soglia è `DUE_SOON_DAYS`;
3. con decorrenza passata, il badge passa al colore critico e dice «in ritardo di N giorni»;
4. «Esegui migrazione» crea il nuovo abbonamento e, se c'era credito, la riga di credito compare in Pagamenti senza spostare il totale incassato;
5. «Annulla migrazione» fa sparire il banner e permette di pianificarne un'altra.

- [ ] **Step 6: Verifica finale e commit**

```bash
cd frontend && npx tsc --noEmit && npm run lint
grep -rLn "withAdmin" app/api --include=route.ts | grep -v auth/
grep -rL "requireAdmin" "app/(protected)" --include=page.tsx
```

Le ultime due non devono stampare nulla.

```bash
git add frontend/components/MigrationBanner.tsx frontend/components/MigrationBadge.tsx "frontend/app/(protected)"
git commit -m "feat: avvisi di migrazione in scheda, elenco e dashboard

Tutto derivato, nessun campo avvisato e nessuna email: la soglia è
DUE_SOON_DAYS, la stessa delle scadenze.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Dopo il piano

Rimane fuori, come da spec: invio di email, esecuzione automatica alla decorrenza, cambio di periodicità e trasferimento fra persone.

Da aggiornare a lavoro finito, secondo la convenzione a tre livelli del repo: `CLAUDE.md` con la sezione sulla migrazione, e `directives/` se l'esecuzione manuale merita una SOP.
