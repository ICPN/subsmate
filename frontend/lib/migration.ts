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
/**
 * Decorrenza a partire dal valore di un <input type="date"> ("2026-11-18").
 *
 * Esiste per un motivo solo: il form mostra un'anteprima del saldo calcolata
 * nel browser, e il server ricalcola lo stesso saldo dalla stessa stringa con
 * z.coerce.date(), che la legge come mezzanotte UTC. Costruendo la data a
 * mezzanotte locale l'anteprima partiva da un istante diverso, e su una
 * scadenza che non cade a mezzanotte i mesi di credito divergevano: l'admin
 * vedeva un saldo che il server poi non applicava. Una sola funzione, così
 * non possono più separarsi.
 */
export function effectiveDateFromInput(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

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
  /** Da versare alla decorrenza. Mai negativo: un ciclo pagato non si rimborsa. */
  saldo: number;
  /** Cicli interi del nuovo abbonamento che il credito chiude da solo. */
  coveredCycles: number;
  /** Credito che avanza dopo i cicli interi, da mettere su quello dopo. */
  creditRemainder: number;
  /** Vero quando il credito copre almeno il primo ciclo per intero. */
  cycleFullyCovered: boolean;
  /**
   * Scomposizione mostrata in interfaccia, somma al saldo per costruzione.
   * Azzerata quando cycleFullyCovered: lì il saldo è zero e la lettura utile
   * è il numero di cicli coperti.
   */
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

  // Cambiando periodicità il credito può valere più di un ciclo intero del
  // nuovo servizio: due mesi accantonati su un servizio caro contro cicli
  // mensili su uno più economico. Quei cicli si chiudono tutti, altrimenti
  // il resto andrebbe perso — ed era denaro già incassato.
  const coveredCycles = newTotal > 0 ? Math.floor(round2(creditAmount / newTotal * 1e6) / 1e6) : 0;
  const applied = round2(Math.min(creditAmount, newTotal));
  const saldo = round2(newTotal - applied);

  // La scomposizione «mesi coperti + mesi da aggiungere» descrive un solo
  // ciclo e somma al saldo per costruzione. Quando il credito copre l'intero
  // ciclo quella lettura non dice più nulla di utile — il saldo è zero e il
  // resto vale per i cicli successivi — quindi si azzera e l'interfaccia
  // mostra invece quanti cicli sono coperti.
  const cycleFullyCovered = coveredCycles >= 1;
  const convertedMonths = cycleFullyCovered ? cycleMonths : Math.min(months, cycleMonths);
  const remainingMonths = cycleFullyCovered ? 0 : cycleMonths - convertedMonths;
  const remainingAmount = round2(remainingMonths * input.newMonthlyRate);
  const convertedAmount = cycleFullyCovered
    ? 0
    : round2(quota - remainingAmount - creditAmount);

  return {
    creditMonths: months,
    creditAmount,
    newTotal,
    saldo,
    coveredCycles,
    // Credito che avanza dopo aver chiuso i cicli interi: finisce sul primo
    // ciclo non coperto come versamento parziale.
    creditRemainder: round2(creditAmount - coveredCycles * newTotal),
    cycleFullyCovered,
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
