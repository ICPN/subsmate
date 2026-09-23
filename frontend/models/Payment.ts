import { Schema, model, models, Types, type InferSchemaType, type Model } from "mongoose";

export const PAYMENT_METHODS = ["bonifico", "contanti", "paypal", "satispay", "altro"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * Riga dello storico pagamenti. Correggibile ma non riassegnabile: importo,
 * donazione, data, metodo, riferimento e note si modificano sul documento
 * esistente (PATCH sulla rotta del pagamento), mentre l'abbonamento a cui è
 * imputato non si cambia — sposterebbe anche `person` e la scadenza di due
 * abbonamenti insieme, quindi quel caso resta cancella-e-reinserisci.
 *
 * La correzione non conserva il valore precedente: l'unica traccia è
 * `updatedAt`, e questo è un limite accettato. Lo storno con riga di rettifica
 * l'avrebbe conservato, ma avrebbe costretto elenco, saldo del ciclo e
 * dashboard a riconoscere e ignorare le coppie stornate.
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
    // Periodo coperto dal pagamento, derivato da paidAt: ricalcolato anche
    // quando una correzione sposta la data, non solo alla registrazione.
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
