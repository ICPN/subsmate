"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { buttonPrimary } from "@/components/ui";
import { Field, TextInput, Select, ErrorMessage, submitJson } from "@/components/form";
import { toDateInputValue } from "@/lib/billing";

/**
 * Form di registrazione pagamento.
 * Importo e donazione sono precompilati con i valori calcolati: l'admin conferma
 * e basta nel caso normale, e li corregge solo se l'incasso è stato diverso.
 */

const METHODS = [
  { value: "bonifico", label: "Bonifico" },
  { value: "contanti", label: "Contanti" },
  { value: "paypal", label: "PayPal" },
  { value: "satispay", label: "Satispay" },
  { value: "altro", label: "Altro" },
];

export function RegisterPaymentForm({
  subscriptionId,
  defaultAmount,
  defaultDonation,
}: {
  subscriptionId: string;
  defaultAmount: number;
  defaultDonation: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const result = await submitJson(
      `/api/subscriptions/${subscriptionId}/payments`,
      "POST",
      {
        amount: Number(form.get("amount")),
        donationAmount: Number(form.get("donationAmount")),
        paidAt: String(form.get("paidAt")),
        method: String(form.get("method")),
        reference: String(form.get("reference") ?? ""),
        notes: String(form.get("notes") ?? ""),
      },
      "Registrazione non riuscita. Riprova."
    );

    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    // La scadenza e lo stato sono ricalcolati lato server: ricarico i dati.
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Importo incassato" hint="Precompilato con il totale dovuto">
          <TextInput
            type="number"
            name="amount"
            step="0.01"
            min="0"
            defaultValue={defaultAmount}
            required
          />
        </Field>

        <Field label="di cui donazione">
          <TextInput
            type="number"
            name="donationAmount"
            step="0.01"
            min="0"
            defaultValue={defaultDonation}
          />
        </Field>

        <Field label="Data del pagamento">
          <TextInput
            type="date"
            name="paidAt"
            defaultValue={toDateInputValue(new Date())}
            required
          />
        </Field>

        <Field label="Metodo">
          <Select name="method" defaultValue="bonifico">
            {METHODS.map((method) => (
              <option key={method.value} value={method.value}>
                {method.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Riferimento" hint="Numero CRO, ID transazione">
          <TextInput type="text" name="reference" />
        </Field>

        <Field label="Note">
          <TextInput type="text" name="notes" />
        </Field>
      </div>

      {error ? <ErrorMessage>{error}</ErrorMessage> : null}

      <button type="submit" disabled={pending} className={buttonPrimary}>
        {pending ? "Registrazione in corso" : "Registra pagamento"}
      </button>
    </form>
  );
}
