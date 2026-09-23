"use client";

import { useState, type FormEvent } from "react";
import { Field, TextInput, Textarea, Checkbox, ErrorMessage, submitJson } from "@/components/form";
import { buttonPrimary } from "@/components/ui";

export interface ServiceFormValues {
  _id?: string;
  name: string;
  monthlyRate: number;
  billingDayOfMonth: number;
  active: boolean;
  notes: string;
}

/**
 * Form create/edit Servizio. Lo slug non è mai nel form: resta generato
 * lato server da slugify(name), sia in creazione che (invariato) in modifica.
 */
export function ServiceForm({
  initialValues,
  onSuccess,
}: {
  initialValues?: ServiceFormValues;
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
    const payload = {
      name: String(form.get("name")),
      monthlyRate: Number(form.get("monthlyRate")),
      billingDayOfMonth: Number(form.get("billingDayOfMonth")),
      active: form.get("active") === "on",
      notes: String(form.get("notes") ?? ""),
    };

    const url = isEdit ? `/api/services/${initialValues!._id}` : "/api/services";
    const result = await submitJson(url, isEdit ? "PATCH" : "POST", payload);

    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    onSuccess(isEdit ? "Servizio aggiornato" : "Servizio creato");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome">
          <TextInput name="name" defaultValue={initialValues?.name} required />
        </Field>
        <Field label="Tariffa mensile (€)">
          <TextInput
            type="number"
            step="0.01"
            min={0}
            name="monthlyRate"
            defaultValue={initialValues?.monthlyRate ?? 0}
            required
          />
        </Field>
        <Field label="Giorno addebito" hint="1–31">
          <TextInput
            type="number"
            min={1}
            max={31}
            name="billingDayOfMonth"
            defaultValue={initialValues?.billingDayOfMonth ?? 18}
            required
          />
        </Field>
        <Field label="Note">
          <Textarea name="notes" defaultValue={initialValues?.notes} />
        </Field>
      </div>

      <Checkbox name="active" label="Attivo" defaultChecked={initialValues?.active ?? true} />

      {error ? <ErrorMessage>{error}</ErrorMessage> : null}

      <button type="submit" disabled={pending} className={buttonPrimary}>
        {pending ? "Salvataggio in corso" : isEdit ? "Salva modifiche" : "Aggiungi servizio"}
      </button>
    </form>
  );
}
