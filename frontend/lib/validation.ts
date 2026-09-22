import { z } from "zod";
import { PERIODICITIES, ONBOARDING_STATUSES } from "@/models/Subscription";
import { PAYMENT_METHODS } from "@/models/Payment";

/** Schemi di input delle API. Tutto ciò che entra dal client passa di qui. */

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "ObjectId non valido");
const optionalDate = z.coerce.date().nullish();

export const serviceCreateSchema = z.object({
  name: z.string().min(1, "Nome obbligatorio"),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "Solo minuscole, numeri e trattini")
    .optional(),
  monthlyRate: z.coerce.number().min(0),
  billingDayOfMonth: z.coerce.number().int().min(1).max(31).optional(),
  active: z.boolean().optional(),
  notes: z.string().optional(),
});
export const serviceUpdateSchema = serviceCreateSchema.partial();

export const personCreateSchema = z.object({
  firstName: z.string().min(1, "Nome obbligatorio"),
  lastName: z.string().min(1, "Cognome obbligatorio"),
  email: z.string().email("Email non valida"),
  active: z.boolean().optional(),
  notes: z.string().optional(),
});
export const personUpdateSchema = personCreateSchema.partial();

export const subscriptionCreateSchema = z.object({
  person: objectId,
  service: objectId,
  periodicity: z.enum(PERIODICITIES).default("monthly"),
  donationSupplement: z.coerce.number().min(0).default(0),
  onboardingStatus: z.enum(ONBOARDING_STATUSES).default("da_attivare"),
  startDate: optionalDate,
  lastPaymentDate: optionalDate,
  notes: z.string().optional(),
});
export const subscriptionUpdateSchema = subscriptionCreateSchema.partial();

export const paymentCreateSchema = z.object({
  subscription: objectId,
  amount: z.coerce.number().min(0).optional(), // se assente si usa il totale dovuto calcolato
  donationAmount: z.coerce.number().min(0).optional(),
  paidAt: z.coerce.date().optional(),
  method: z.enum(PAYMENT_METHODS).optional(),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

export type ServiceInput = z.infer<typeof serviceCreateSchema>;
export type PersonInput = z.infer<typeof personCreateSchema>;
export type SubscriptionInput = z.infer<typeof subscriptionCreateSchema>;
export type PaymentInput = z.infer<typeof paymentCreateSchema>;
