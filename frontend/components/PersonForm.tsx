"use client";

import { useState, type FormEvent } from "react";
import { Field, TextInput, Textarea, Checkbox, ErrorMessage, submitJson } from "@/components/form";
import { buttonPrimary } from "@/components/ui";

export interface PersonFormValues {
  _id?: string;
  firstName: string;
  lastName: string;
  email: string;
  active: boolean;
  notes: string;
}

export function PersonForm({
  initialValues,
  onSuccess,
}: {
  initialValues?: PersonFormValues;
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
      firstName: String(form.get("firstName")),
      lastName: String(form.get("lastName")),
      email: String(form.get("email")),
      active: form.get("active") === "on",
      notes: String(form.get("notes") ?? ""),
    };

    const url = isEdit ? `/api/people/${initialValues!._id}` : "/api/people";
    const result = await submitJson(url, isEdit ? "PATCH" : "POST", payload);

    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    onSuccess(isEdit ? "Persona aggiornata" : "Persona creata");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome">
          <TextInput name="firstName" defaultValue={initialValues?.firstName} required />
        </Field>
        <Field label="Cognome">
          <TextInput name="lastName" defaultValue={initialValues?.lastName} required />
        </Field>
        <Field label="Email">
          <TextInput type="email" name="email" defaultValue={initialValues?.email} required />
        </Field>
        <Field label="Note">
          <Textarea name="notes" defaultValue={initialValues?.notes} />
        </Field>
      </div>

      <Checkbox name="active" label="Attiva" defaultChecked={initialValues?.active ?? true} />

      {error ? <ErrorMessage>{error}</ErrorMessage> : null}

      <button type="submit" disabled={pending} className={buttonPrimary}>
        {pending ? "Salvataggio in corso" : isEdit ? "Salva modifiche" : "Aggiungi persona"}
      </button>
    </form>
  );
}
