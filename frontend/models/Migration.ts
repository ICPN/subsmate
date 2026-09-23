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
    // Senza `index: true`: l'indice su questo campo è dichiarato più sotto con
    // unique e partialFilterExpression. Dichiararlo in entrambi i modi fa sì
    // che MongoDB crei solo il primo e scarti silenziosamente unique e il
    // filtro parziale, lasciando il vincolo inesistente.
    fromSubscription: { type: Types.ObjectId, ref: "Subscription", required: true },
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
