import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

/**
 * Servizio LLM a cui il team è abbonato (Claude, ChatGPT, ...).
 * Nuovi servizi si aggiungono come documenti, senza toccare lo schema.
 */
const ServiceSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // Tariffa mensile per persona, in euro. Base di calcolo della quota.
    monthlyRate: { type: Number, required: true, min: 0 },
    // Giorno del mese in cui la piattaforma addebita l'abbonamento (1-31).
    // 18 è la convenzione del team ICPN, non un valore arbitrario.
    billingDayOfMonth: { type: Number, min: 1, max: 31, default: 18 },
    active: { type: Boolean, default: true },
    notes: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

export type ServiceDoc = InferSchemaType<typeof ServiceSchema>;

export const Service: Model<ServiceDoc> =
  (models.Service as Model<ServiceDoc>) || model<ServiceDoc>("Service", ServiceSchema);

export default Service;
