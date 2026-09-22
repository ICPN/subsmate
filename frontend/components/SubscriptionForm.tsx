"use client";

import { useState, type FormEvent } from "react";
import { Field, TextInput, Select, Textarea, ErrorMessage } from "@/components/form";
import { buttonPrimary } from "@/components/ui";

const PERIODICITY_OPTIONS = [
  { value: "monthly", label: "Mensile" },
  { value: "quarterly", label: "Trimestrale" },
];

const ONBOARDING_OPTIONS = [
  { value: "da_attivare", label: "Da attivare" },
  { value: "attivo", label: "Attivo" },
  { value: "sospeso", label: "Sospeso" },
  { value: "cessato", label: "Cessato" },
];

export interface SubscriptionFormValues {
  _id?: string;
  person: string;
  personLabel: string;
  service: string;
  serviceLabel: string;
  periodicity: string;
  donationSupplement: number;
  onboardingStatus: string;
  startDate: string; // "yyyy-mm-dd" oppure ""
  notes: string;
}

interface PersonOption {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface ServiceOption {
  _id: string;
  name: string;
}

/**
 * Form create/edit Abbonamento. Persona e servizio si scelgono solo in
 * creazione (identificano la coppia unica person+service): in modifica
 * restano testo di sola lettura, coerente con la correzione via
 * cancella-e-reinserisci già usata per i Pagamenti invece che con un
 * cambio di identità dell'abbonamento.
 */
export function SubscriptionForm({
  people,
  services,
  initialValues,
  onSuccess,
}: {
  people: PersonOption[];
  services: ServiceOption[];
  initialValues?: SubscriptionFormValues;
  onSuccess: (message: string) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEdit = Boolean(initialValues?._id);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const startDate = String(form.get("startDate") ?? "");
    const payload: Record<string, unknown> = {
      periodicity: String(form.get("periodicity")),
      donationSupplement: Number(form.get("donationSupplement") ?? 0),
      onboardingStatus: String(form.get("onboardingStatus")),
      startDate: startDate || null,
      notes: String(form.get("notes") ?? ""),
    };
    if (!isEdit) {
      payload.person = String(form.get("person"));
      payload.service = String(form.get("service"));
    }

    const url = isEdit ? `/api/subscriptions/${initialValues!._id}` : "/api/subscriptions";
    const response = await fetch(url, {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setPending(false);

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error ?? "Salvataggio non riuscito. Riprova.");
      return;
    }

    onSuccess(isEdit ? "Abbonamento aggiornato" : "Abbonamento creato");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
      <div className="grid gap-4 sm:grid-cols-2">
        {!isEdit ? (
          <>
            <Field label="Persona">
              <Select name="person" defaultValue="" required>
                <option value="" disabled>
                  Seleziona una persona
                </option>
                {people.map((person) => (
                  <option key={person._id} value={person._id}>
                    {person.lastName} {person.firstName} — {person.email}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Servizio">
              <Select name="service" defaultValue="" required>
                <option value="" disabled>
                  Seleziona un servizio
                </option>
                {services.map((service) => (
                  <option key={service._id} value={service._id}>
                    {service.name}
                  </option>
                ))}
              </Select>
            </Field>
          </>
        ) : (
          <>
            <Field label="Persona">
              <p className="px-3 py-2 text-sm">{initialValues!.personLabel}</p>
            </Field>
            <Field label="Servizio">
              <p className="px-3 py-2 text-sm">{initialValues!.serviceLabel}</p>
            </Field>
          </>
        )}

        <Field label="Periodicità">
          <Select name="periodicity" defaultValue={initialValues?.periodicity ?? "monthly"} required>
            {PERIODICITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Stato onboarding">
          <Select
            name="onboardingStatus"
            defaultValue={initialValues?.onboardingStatus ?? "da_attivare"}
            required
          >
            {ONBOARDING_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Supplemento donazione (€)">
          <TextInput
            type="number"
            step="0.01"
            min={0}
            name="donationSupplement"
            defaultValue={initialValues?.donationSupplement ?? 0}
          />
        </Field>

        <Field label="Data inizio">
          <TextInput type="date" name="startDate" defaultValue={initialValues?.startDate ?? ""} />
        </Field>

        <Field label="Note">
          <Textarea name="notes" defaultValue={initialValues?.notes} />
        </Field>
      </div>

      {error ? <ErrorMessage>{error}</ErrorMessage> : null}

      <button type="submit" disabled={pending} className={buttonPrimary}>
        {pending ? "Salvataggio in corso" : isEdit ? "Salva modifiche" : "Crea abbonamento"}
      </button>
    </form>
  );
}
