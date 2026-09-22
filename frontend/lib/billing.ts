import type { Periodicity, OnboardingStatus } from "@/models/Subscription";

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

export type PaymentStatus = "in_regola" | "in_scadenza" | "in_ritardo" | "da_attivare";

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  in_regola: "In regola",
  in_scadenza: "In scadenza",
  in_ritardo: "In ritardo",
  da_attivare: "Da attivare",
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
 * Prossima scadenza: ultimo pagamento + periodicità.
 * Senza pagamenti si usa la data di inizio; senza nemmeno quella è null
 * (abbonamento ancora da attivare).
 */
export function nextDueDate(
  lastPaymentDate: Date | null | undefined,
  startDate: Date | null | undefined,
  periodicity: Periodicity
): Date | null {
  if (lastPaymentDate) return addMonths(new Date(lastPaymentDate), PERIOD_MONTHS[periodicity]);
  if (startDate) return new Date(startDate);
  return null;
}

/** Stato pagamento derivato. Mai persistito: si ricalcola ad ogni lettura. */
export function paymentStatus(
  due: Date | null,
  onboardingStatus: OnboardingStatus,
  now: Date = new Date()
): PaymentStatus {
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
  },
  now: Date = new Date()
): SubscriptionComputation {
  const donation = input.donationSupplement ?? 0;
  const due = nextDueDate(input.lastPaymentDate, input.startDate, input.periodicity);
  return {
    serviceQuota: serviceQuota(input.monthlyRate, input.periodicity),
    donationSupplement: donation,
    totalDue: totalDue(input.monthlyRate, input.periodicity, donation),
    nextDueDate: due,
    daysToDue: due ? daysBetween(now, due) : null,
    status: paymentStatus(due, input.onboardingStatus, now),
  };
}

/** Periodo coperto da un pagamento effettuato in una certa data. */
export function coveredPeriod(paidAt: Date, periodicity: Periodicity) {
  return {
    periodStart: new Date(paidAt),
    periodEnd: addMonths(new Date(paidAt), PERIOD_MONTHS[periodicity]),
  };
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
 * Descrizione testuale dello stato, esplicita come richiesto dal tono di voce
 * del brand: "In ritardo di 5 giorni" invece di "Attenzione richiesta".
 */
export function statusDetail(status: PaymentStatus, daysToDue: number | null): string {
  if (status === "da_attivare" || daysToDue === null) return "Nessun pagamento registrato";
  if (status === "in_ritardo") return `In ritardo di ${plural(Math.abs(daysToDue), "giorno", "giorni")}`;
  if (daysToDue === 0) return "Scade oggi";
  return `Scade fra ${plural(daysToDue, "giorno", "giorni")}`;
}

function plural(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
