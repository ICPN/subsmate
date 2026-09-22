import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

/**
 * Admin che accede all'app (email + password).
 * Il campo passwordHash contiene sempre un hash: la password in chiaro
 * non viene mai persistita né loggata.
 */
const AdminUserSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ["admin", "owner"], default: "admin" },
    active: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },
    // Confrontato con l'iat del token: cambiare password invalida le sessioni aperte.
    passwordChangedAt: { type: Date, default: null },
    // Protezione forza bruta: 5 fallimenti bloccano l'account per 15 minuti.
    failedLoginAttempts: { type: Number, default: 0, min: 0 },
    lockedUntil: { type: Date, default: null },
  },
  { timestamps: true }
);

export type AdminUserDoc = InferSchemaType<typeof AdminUserSchema>;

export const AdminUser: Model<AdminUserDoc> =
  (models.AdminUser as Model<AdminUserDoc>) ||
  model<AdminUserDoc>("AdminUser", AdminUserSchema);

export default AdminUser;
