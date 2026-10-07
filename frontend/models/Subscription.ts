import { Schema, model, models, Types, type InferSchemaType, type Model } from "mongoose";

export const PERIODICITIES = ["monthly", "quarterly"] as const;
export type Periodicity = (typeof PERIODICITIES)[number];

export const ONBOARDING_STATUSES = ["da_attivare", "attivo", "sospeso", "cessato"] as const;
export type OnboardingStatus = (typeof ONBOARDING_STATUSES)[number];

/**
 * Istanza persona × servizio. Una persona può averne più di una
 * contemporaneamente (es. Claude + ChatGPT), con periodicità diverse.
 * Lo stato di pagamento NON è salvato: è derivato in lib/billing.ts da
 * lastPaymentDate + periodicity, così non può andare fuori sincrono.
 */
const SubscriptionSchema = new Schema(
  {
    person: { type: Types.ObjectId, ref: "Person", required: true, index: true },
    service: { type: Types.ObjectId, ref: "Service", required: true, index: true },
    periodicity: { type: String, enum: PERIODICITIES, required: true, default: "monthly" },
    // Supplemento donazione volontario, sommato alla quota servizio nel totale dovuto.
    donationSupplement: { type: Number, min: 0, default: 0 },
    onboardingStatus: {
      type: String,
      enum: ONBOARDING_STATUSES,
      required: true,
      default: "da_attivare",
    },
    startDate: { type: Date, default: null },
    // Aggiornata dalla registrazione di un pagamento; base per la prossima scadenza.
    lastPaymentDate: { type: Date, default: null },
    // Quanto il fornitore ha addebitato per il primo mese, quando lo fa in
    // proporzione ai giorni (ChatGPT, aggiungendo un posto a metà ciclo). Lo
    // inserisce l'admin a posteriori, dopo averlo verificato sulla fattura.
    firstCycleProviderCharge: { type: Number, min: 0, default: null },
    // Credito della persona: tariffa mensile al momento dell'inserimento meno
    // l'addebito qui sopra. Salvato e non derivato perché la tariffa può
    // cambiare, e il credito resta quello che la persona ha versato allora. Il
    // disponibile (meno quanto già speso o portato via da una migrazione) si
    // calcola invece a ogni lettura.
    firstCycleCredit: { type: Number, min: 0, default: null },
    notes: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

// Una sola sottoscrizione per coppia persona/servizio.
SubscriptionSchema.index({ person: 1, service: 1 }, { unique: true });

export type SubscriptionDoc = InferSchemaType<typeof SubscriptionSchema>;

export const Subscription: Model<SubscriptionDoc> =
  (models.Subscription as Model<SubscriptionDoc>) ||
  model<SubscriptionDoc>("Subscription", SubscriptionSchema);

export default Subscription;
