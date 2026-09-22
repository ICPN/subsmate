"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { buttonPrimary } from "@/components/ui";

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
    const response = await fetch(`/api/subscriptions/${subscriptionId}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: Number(form.get("amount")),
        donationAmount: Number(form.get("donationAmount")),
        paidAt: String(form.get("paidAt")),
        method: String(form.get("method")),
        reference: String(form.get("reference") ?? ""),
        notes: String(form.get("notes") ?? ""),
      }),
    });

    setPending(false);

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error ?? "Registrazione non riuscita. Riprova.");
      return;
    }

    // La scadenza e lo stato sono ricalcolati lato server: ricarico i dati.
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Importo incassato" hint="Precompilato con il totale dovuto">
          <input
            type="number"
            name="amount"
            step="0.01"
            min="0"
            defaultValue={defaultAmount}
            required
            className={inputClass}
          />
        </Field>

        <Field label="di cui donazione">
          <input
            type="number"
            name="donationAmount"
            step="0.01"
            min="0"
            defaultValue={defaultDonation}
            className={inputClass}
          />
        </Field>

        <Field label="Data del pagamento">
          <input
            type="date"
            name="paidAt"
            defaultValue={new Date().toISOString().slice(0, 10)}
            required
            className={inputClass}
          />
        </Field>

        <Field label="Metodo">
          <select name="method" defaultValue="bonifico" className={inputClass}>
            {METHODS.map((method) => (
              <option key={method.value} value={method.value}>
                {method.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Riferimento" hint="Numero CRO, ID transazione">
          <input type="text" name="reference" className={inputClass} />
        </Field>

        <Field label="Note">
          <input type="text" name="notes" className={inputClass} />
        </Field>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-[var(--radius)] px-3 py-2 text-sm"
          style={{
            color: "var(--status-critical)",
            backgroundColor: "color-mix(in srgb, var(--status-critical) 12%, transparent)",
          }}
        >
          {error}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className={buttonPrimary}>
        {pending ? "Registrazione in corso" : "Registra pagamento"}
      </button>
    </form>
  );
}

const inputClass =
  "w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink-navy)]";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-[var(--ink-muted)]">{hint}</span> : null}
    </label>
  );
}
