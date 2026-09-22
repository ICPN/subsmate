import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

/** Persona del team che può avere uno o più abbonamenti. */
const PersonSchema = new Schema(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    active: { type: Boolean, default: true },
    notes: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

PersonSchema.virtual("fullName").get(function () {
  return `${this.firstName} ${this.lastName}`.trim();
});

export type PersonDoc = InferSchemaType<typeof PersonSchema>;

export const Person: Model<PersonDoc> =
  (models.Person as Model<PersonDoc>) || model<PersonDoc>("Person", PersonSchema);

export default Person;
