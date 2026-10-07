import type { Periodicity, OnboardingStatus } from "@/models/Subscription";
import type { PaymentKind } from "@/models/Payment";

/**
 * Motore di calcolo di SubsMate.
 * Funzioni pure e deterministiche: nessun accesso al DB, nessuna data "now"
 * implicita (viene sempre passata), così sono testabili e riproducibili.
 */

export const PERIOD_MONTHS: Record<Periodicity, number> = {
  monthly: 1,
  quarterly: 3,
};

/** Giorni di preavviso entro i quali un abbonamento è considerato "in scadenza" (brand-guidelines.md §3). */
export const DUE_SOON_DAYS = 15;

export type PaymentStatus = "in_regola" | "in_scadenza" | "in_ritardo" | "da_attivare" | "cessato";

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  in_regola: "In regola",
  in_scadenza: "In scadenza",
  in_ritardo: "In ritardo",
  da_attivare: "Da attivare",
  cessato: "Cessato",
};

/** Somma mesi a una data gestendo i mesi corti (31 gen + 1 mese = 28/29 feb). */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const targetDay = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const lastDayOfTargetMonth = new Date(
    result.getFullYear(),
    result.getMonth() + 1,
    0
  ).getDate();
  result.setDate(Math.min(targetDay, lastDayOfTargetMonth));
  return result;
}

/** Differenza in giorni interi fra due date, ignorando l'orario. */
export function daysBetween(from: Date, to: Date): number {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / MS_PER_DAY);
}

/** Quota servizio per un ciclo: tariffa mensile × mesi della periodicità. */
export function serviceQuota(monthlyRate: number, periodicity: Periodicity): number {
  return round2(monthlyRate * PERIOD_MONTHS[periodicity]);
}

/** Totale dovuto per un ciclo: quota servizio + supplemento donazione. */
export function totalDue(
  monthlyRate: number,
  periodicity: Periodicity,
  donationSupplement = 0
): number {
  return round2(serviceQuota(monthlyRate, periodicity) + donationSupplement);
}

/**
 * Porta una data sul giorno di addebito del servizio, tagliando sui mesi corti
 * (addebito il 31 in febbraio → 28 o 29). Senza giorno di addebito la data resta
 * invariata, così i servizi che non lo dichiarano mantengono il comportamento
 * "stessa data del pagamento".
 */
export function onBillingDay(date: Date, billingDayOfMonth?: number | null): Date {
  const result = new Date(date.getTime());
  if (!billingDayOfMonth) return result;
  const lastDayOfMonth = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(billingDayOfMonth, lastDayOfMonth));
  return result;
}

/**
 * Prossima scadenza: giorno di addebito del servizio nel mese successivo al
 * pagamento (periodicità mensile) o tre mesi dopo (trimestrale).
 *
 * Conta il MESE del pagamento, non il giorno: chi versa il 3 e chi versa il 27
 * di settembre hanno entrambi scadenza il 18 ottobre. Senza pagamenti si usa
 * allo stesso modo il mese della data di inizio; senza nemmeno quella è null
 * (abbonamento ancora da attivare).
 */
export function nextDueDate(
  lastPaymentDate: Date | null | undefined,
  startDate: Date | null | undefined,
  periodicity: Periodicity,
  billingDayOfMonth?: number | null
): Date | null {
  const months = PERIOD_MONTHS[periodicity];
  const base = lastPaymentDate ?? startDate;
  if (!base) return null;
  return onBillingDay(addMonths(new Date(base), months), billingDayOfMonth);
}

/** Stato pagamento derivato. Mai persistito: si ricalcola ad ogni lettura. */
export function paymentStatus(
  due: Date | null,
  onboardingStatus: OnboardingStatus,
  now: Date = new Date()
): PaymentStatus {
  // Un abbonamento chiuso non deve più nulla: senza questo controllo, passata
  // la sua ultima scadenza risulterebbe in ritardo per sempre (per esempio il
  // vecchio abbonamento dopo una migrazione) e finirebbe fra quelli da seguire.
  if (onboardingStatus === "cessato") return "cessato";
  if (onboardingStatus === "da_attivare" || !due) return "da_attivare";
  const remaining = daysBetween(now, due);
  if (remaining < 0) return "in_ritardo";
  if (remaining <= DUE_SOON_DAYS) return "in_scadenza";
  return "in_regola";
}

export interface SubscriptionComputation {
  serviceQuota: number;
  donationSupplement: number;
  totalDue: number;
  nextDueDate: Date | null;
  daysToDue: number | null;
  status: PaymentStatus;
  /** Somma già incassata per il ciclo in corso. */
  paidForCurrentCycle: number;
  /** Quanto manca ancora per quel ciclo. Zero se il ciclo è saldato. */
  outstanding: number;
}

/** Pagamento, ridotto ai campi che servono al calcolo del saldo. */
export interface PaymentForBalance {
  amount: number;
  /** Quando è stato versato: è l'inizio del periodo se questo non è salvato. */
  paidAt?: Date | string | null;
  /**
   * Inizio del ciclo che il pagamento copre. Di solito coincide con paidAt;
   * differisce per i versamenti che completano un ciclo già aperto e per i
   * crediti di migrazione, ancorati all'inizio del ciclo che chiudono.
   */
  periodStart?: Date | string | null;
}

/** Inizio del ciclo coperto da un pagamento: periodStart, o paidAt se manca. */
function periodAnchor(payment: PaymentForBalance): Date | null {
  const anchor = payment.periodStart ?? payment.paidAt;
  return anchor ? new Date(anchor) : null;
}

/** Stesso giorno di calendario, ignorando l'orario. */
function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Quanto è stato incassato per il ciclo che scade in `due`.
 *
 * Un pagamento appartiene al ciclo corrente se la fine del periodo che copre
 * coincide con la scadenza corrente: tutti i versamenti fatti nello stesso
 * ciclo sono ancorati allo stesso giorno di addebito, quindi condividono la
 * stessa fine. Serve a sommare più versamenti parziali dello stesso ciclo
 * senza confonderli con quelli dei cicli precedenti.
 */
export function paidForCycle(
  payments: PaymentForBalance[],
  due: Date | null,
  periodicity: Periodicity,
  billingDayOfMonth?: number | null
): number {
  if (!due) return 0;
  const total = payments.reduce((sum, payment) => {
    // La fine del periodo si ricalcola sempre con la periodicità e il giorno
    // di addebito di adesso, come la scadenza: il periodEnd salvato resta
    // quello di quando il pagamento è nato, e dopo un cambio di periodicità o
    // di giorno di addebito non combacerebbe più — il ciclo risulterebbe non
    // pagato e una migrazione non maturerebbe credito. Le righe importate dal
    // Google Sheet non hanno periodo salvato: lo si ricava da paidAt.
    const anchor = periodAnchor(payment);
    if (!anchor) return sum;
    const end = coveredPeriod(anchor, periodicity, billingDayOfMonth).periodEnd;
    return isSameDay(end, due) ? sum + payment.amount : sum;
  }, 0);
  return round2(total);
}

/**
 * `lastPaymentDate` ricostruita dallo storico, quando il pagamento che la
 * definiva viene corretto o cancellato: l'inizio dell'ultimo ciclo coperto,
 * non il paidAt più recente. I crediti di migrazione hanno tutti paidAt alla
 * decorrenza ma coprono cicli successivi: ripartire da paidAt farebbe
 * arretrare la scadenza di cicli già pagati.
 */
export function lastPaymentDateFrom(payments: PaymentForBalance[]): Date | null {
  let latest: Date | null = null;
  for (const payment of payments) {
    const anchor = periodAnchor(payment);
    if (anchor && (!latest || anchor > latest)) latest = anchor;
  }
  return latest;
}

/** Calcolo completo per un abbonamento: usato da API e UI, un'unica fonte di verità. */
export function computeSubscription(
  input: {
    monthlyRate: number;
    periodicity: Periodicity;
    donationSupplement?: number;
    onboardingStatus: OnboardingStatus;
    startDate?: Date | null;
    lastPaymentDate?: Date | null;
    billingDayOfMonth?: number | null;
    /** Storico pagamenti: serve solo a calcolare quanto manca al ciclo corrente. */
    payments?: PaymentForBalance[];
  },
  now: Date = new Date()
): SubscriptionComputation {
  const donation = input.donationSupplement ?? 0;
  const due = nextDueDate(
    input.lastPaymentDate,
    input.startDate,
    input.periodicity,
    input.billingDayOfMonth
  );
  const dueTotal = totalDue(input.monthlyRate, input.periodicity, donation);
  const paid = paidForCycle(
    input.payments ?? [],
    due,
    input.periodicity,
    input.billingDayOfMonth
  );
  return {
    serviceQuota: serviceQuota(input.monthlyRate, input.periodicity),
    donationSupplement: donation,
    totalDue: dueTotal,
    nextDueDate: due,
    daysToDue: due ? daysBetween(now, due) : null,
    status: paymentStatus(due, input.onboardingStatus, now),
    paidForCurrentCycle: paid,
    // Un incasso superiore al dovuto non è un credito da esporre: resta zero.
    outstanding: paid > 0 ? Math.max(0, round2(dueTotal - paid)) : 0,
  };
}

/**
 * Periodo coperto da un pagamento effettuato in una certa data. La fine del
 * periodo coincide con la scadenza successiva, quindi segue lo stesso giorno di
 * addebito: altrimenti lo storico mostrerebbe un periodo che non combacia con la
 * data in cui l'abbonamento risulta di nuovo da pagare.
 */
export function coveredPeriod(
  paidAt: Date,
  periodicity: Periodicity,
  billingDayOfMonth?: number | null
) {
  return {
    periodStart: new Date(paidAt),
    periodEnd: onBillingDay(
      addMonths(new Date(paidAt), PERIOD_MONTHS[periodicity]),
      billingDayOfMonth
    ),
  };
}

/**
 * Tipi di pagamento che chiudono un ciclo senza essere denaro entrato in quel
 * momento: vanno esclusi da ogni aggregato di denaro, o conterebbero due volte
 * un incasso già registrato altrove. Nelle query Mongo con `$nin`, non
 * `$eq: "incasso"`: i pagamenti anteriori al campo non hanno `kind` in
 * documento. Sta qui e non in models/Payment.ts perché la usano anche i Client
 * Component, che non devono importare mongoose.
 */
export const CREDIT_KINDS: PaymentKind[] = ["credito_migrazione", "credito_primo_mese"];

export const CREDIT_KIND_LABELS: Record<string, string> = {
  credito_migrazione: "Credito migrazione",
  credito_primo_mese: "Credito primo mese",
};

export function isCreditKind(kind: string | null | undefined): boolean {
  return CREDIT_KINDS.includes(kind as PaymentKind);
}

/**
 * Credito del primo mese: alcuni fornitori (ChatGPT) addebitano solo i giorni
 * fra l'aggiunta del posto e il rinnovo, mentre la persona versa il mese pieno.
 * La differenza è sua. La donazione resta fuori: è versata e non consumata
 * indipendentemente da quanto addebita il fornitore.
 */
export function firstCycleCredit(monthlyRate: number, providerCharge: number): number {
  return round2(Math.max(0, monthlyRate - providerCharge));
}

/**
 * Quanto resta del credito del primo mese, tolti i versamenti
 * "credito_primo_mese" già spesi e quello trasferito da migrazioni eseguite.
 */
export function availableFirstCycleCredit(
  credit: number | null | undefined,
  used: number[]
): number {
  const spent = used.reduce((sum, amount) => sum + amount, 0);
  return round2(Math.max(0, (credit ?? 0) - spent));
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function formatEUR(value: number): string {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(value);
}

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("it-IT", { dateStyle: "medium" }).format(new Date(value));
}

/**
 * Converte una data nel formato "yyyy-mm-dd" atteso da <input type="date">,
 * usando i componenti locali (non UTC): `toISOString()` sposterebbe la data
 * di un giorno per orari vicini alla mezzanotte in fusi orari diversi da UTC,
 * disallineandosi da `formatDate()` che mostra sempre l'orario locale.
 */
export function toDateInputValue(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Descrizione testuale dello stato, esplicita come richiesto dal tono di voce
 * del brand: "In ritardo di 5 giorni" invece di "Attenzione richiesta".
 */
export function statusDetail(status: PaymentStatus, daysToDue: number | null): string {
  if (status === "cessato") return "Abbonamento chiuso";
  if (status === "da_attivare" || daysToDue === null) return "Nessun pagamento registrato";
  if (status === "in_ritardo") return `In ritardo di ${plural(Math.abs(daysToDue), "giorno", "giorni")}`;
  if (daysToDue === 0) return "Scade oggi";
  return `Scade fra ${plural(daysToDue, "giorno", "giorni")}`;
}

function plural(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
