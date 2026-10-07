"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Field, TextInput, ErrorMessage, submitJson } from "@/components/form";
import { Card, buttonPrimary } from "@/components/ui";
import { useToast } from "@/components/Toast";

/**
 * Cambio email e password dell'admin collegato. Due form separati: chi cambia
 * l'email non deve compilare i campi della password, e ognuno chiede la
 * password attuale per conto suo.
 */

const MIN_PASSWORD_LENGTH = 12;

export function ChangeEmailForm({ email }: { email: string }) {
  const router = useRouter();
  const showToast = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setPending(true);
    setError(null);
    const result = await submitJson(
      "/api/account",
      "PATCH",
      { email: String(form.get("email")), currentPassword: String(form.get("currentPassword")) },
      "Cambio email non riuscito. Riprova."
    );
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    formElement.reset();
    showToast("Email aggiornata");
    router.refresh();
  }

  return (
    <Card title="Cambia email">
      <form onSubmit={handleSubmit} className="space-y-4 px-4 py-5">
        <Field label="Nuova email" hint={`Attuale: ${email}. È quella con cui accedi.`}>
          <TextInput type="email" name="email" autoComplete="email" required />
        </Field>
        <Field label="Password attuale">
          <TextInput type="password" name="currentPassword" autoComplete="current-password" required />
        </Field>
        {error ? <ErrorMessage>{error}</ErrorMessage> : null}
        <button type="submit" disabled={pending} className={buttonPrimary}>
          {pending ? "Salvataggio in corso" : "Cambia email"}
        </button>
      </form>
    </Card>
  );
}

export function ChangePasswordForm() {
  const showToast = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const newPassword = String(form.get("newPassword"));
    if (newPassword !== String(form.get("confirmPassword"))) {
      setError("Le due password nuove non coincidono.");
      return;
    }
    setPending(true);
    setError(null);
    const result = await submitJson(
      "/api/account",
      "PATCH",
      { newPassword, currentPassword: String(form.get("currentPassword")) },
      "Cambio password non riuscito. Riprova."
    );
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    formElement.reset();
    showToast("Password aggiornata. Le altre sessioni sono state chiuse.");
  }

  return (
    <Card title="Cambia password">
      <form onSubmit={handleSubmit} className="space-y-4 px-4 py-5">
        <Field label="Password attuale">
          <TextInput type="password" name="currentPassword" autoComplete="current-password" required />
        </Field>
        <Field label="Nuova password" hint={`Almeno ${MIN_PASSWORD_LENGTH} caratteri.`}>
          <TextInput
            type="password"
            name="newPassword"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            required
          />
        </Field>
        <Field label="Ripeti la nuova password">
          <TextInput
            type="password"
            name="confirmPassword"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            required
          />
        </Field>
        {error ? <ErrorMessage>{error}</ErrorMessage> : null}
        <button type="submit" disabled={pending} className={buttonPrimary}>
          {pending ? "Salvataggio in corso" : "Cambia password"}
        </button>
      </form>
    </Card>
  );
}
