import { Schema, model, models, Types, type InferSchemaType, type Model } from "mongoose";

export const PAYMENT_METHODS = ["bonifico", "contanti", "paypal", "satispay", "altro"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * Riga dello storico pagamenti. Immutabile per natura: le correzioni si fanno
 * cancellando e reinserendo, così lo storico resta leggibile.
 */
const PaymentSchema = new Schema(
  {
    subscription: { type: Types.ObjectId, ref: "Subscription", required: true, index: true },
    // Denormalizzata: permette l'aggregato per persona senza join sugli abbonamenti.
    person: { type: Types.ObjectId, ref: "Person", required: true, index: true },
    // Importo totale incassato (quota servizio + eventuale donazione).
    amount: { type: Number, required: true, min: 0 },
    // Parte dell'importo imputata a donazione, per il totale donazioni in dashboard.
    donationAmount: { type: Number, min: 0, default: 0 },
    paidAt: { type: Date, required: true, default: () => new Date() },
    method: { type: String, enum: PAYMENT_METHODS, default: "bonifico" },
    // Periodo coperto dal pagamento, calcolato al momento della registrazione.
    periodStart: { type: Date, default: null },
    periodEnd: { type: Date, default: null },
    reference: { type: String, trim: true, default: "" },
    notes: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

PaymentSchema.index({ paidAt: -1 });

export type PaymentDoc = InferSchemaType<typeof PaymentSchema>;

export const Payment: Model<PaymentDoc> =
  (models.Payment as Model<PaymentDoc>) || model<PaymentDoc>("Payment", PaymentSchema);

export default Payment;
