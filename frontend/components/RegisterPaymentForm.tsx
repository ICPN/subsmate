"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { buttonPrimary } from "@/components/ui";
import { Field, TextInput, Select, ErrorMessage, submitJson } from "@/components/form";
import { SubscriptionPicker } from "@/components/SubscriptionPicker";
import { formatEUR, toDateInputValue } from "@/lib/billing";

/**
 * Form di registrazione pagamento.
 *
 * L'importo è quello effettivamente incassato, non la quota dovuta: i due
 * numeri possono differire e il form lo dice invece di allinearli. La quota
 * serve solo a precompilare il campo, e la precompilazione si ferma appena
 * l'admin scrive un valore suo — scegliere l'abbonamento dopo aver digitato
 * l'importo non deve riscrivere quello che ha appena inserito.
 *
 * Tre modi d'uso: dalla scheda di un abbonamento l'abbonamento è già noto e si
 * passa `subscriptionId`; dalla pagina Pagamenti si passa invece l'elenco in
 * `subscriptions` e lo si cerca con SubscriptionPicker; passando `payment` il
 * form corregge un pagamento esistente (PATCH invece di POST). La modalità di
 * modifica riusa questo form invece di averne uno suo per non duplicare il
 * calcolo del residuo e l'avviso sull'incasso parziale.
 */

const METHODS = [
  { value: "bonifico", label: "Bonifico" },
  { value: "contanti", label: "Contanti" },
  { value: "paypal", label: "PayPal" },
  { value: "satispay", label: "Satispay" },
  { value: "altro", label: "Altro" },
];

export interface PaymentSubscriptionOption {
  _id: string;
  /** Campi separati, non una sola etichetta: la ricerca li interroga uno per uno. */
  personName: string;
  email: string;
  serviceName: string;
  serviceLogo: string | null;
  /** Dovuto per un ciclo intero. */
  totalDue: number;
  /** Quanto manca ancora per il ciclo in corso, se già pagato in parte. */
  outstanding: number;
  donationSupplement: number;
}

/** Pagamento da correggere, nei campi che il form sa modificare. */
export interface EditablePayment {
  _id: string;
  amount: number;
  donationAmount: number;
  /** ISO: il form la riduce a "yyyy-mm-dd" con i componenti locali. */
  paidAt: string;
  method: string;
  reference: string;
  notes: string;
}

export function RegisterPaymentForm({
  subscriptionId,
  subscriptions,
  payment,
  defaultAmount = 0,
  defaultDonation = 0,
  defaultOutstanding = 0,
  onSuccess,
}: {
  subscriptionId?: string;
  subscriptions?: PaymentSubscriptionOption[];
  /** Se presente il form corregge questo pagamento invece di crearne uno. */
  payment?: EditablePayment;
  defaultAmount?: number;
  defaultDonation?: number;
  defaultOutstanding?: number;
  onSuccess?: (message: string) => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState(subscriptionId ?? "");

  const editing = Boolean(payment);
  // In modifica l'abbonamento non si cambia: la rotta PATCH non lo accetta,
  // perché sposterebbe anche la persona e la scadenza di due abbonamenti.
  const chooseSubscription = !subscriptionId && !editing;
  const current = subscriptions?.find((option) => option._id === selected);

  const expected = chooseSubscription ? (current?.totalDue ?? 0) : defaultAmount;
  const outstanding = chooseSubscription ? (current?.outstanding ?? 0) : defaultOutstanding;
  const donationSuggested = chooseSubscription
    ? (current?.donationSupplement ?? 0)
    : defaultDonation;
  // Se il ciclo è già pagato in parte, il residuo è il suggerimento utile.
  const suggestedAmount = outstanding > 0 ? outstanding : expected;

  // In modifica si parte dai valori registrati, non dal suggerimento: l'importo
  // incassato è un fatto, la quota dovuta solo un'ipotesi di partenza.
  const [amount, setAmount] = useState(
    payment ? String(payment.amount) : String(suggestedAmount || "")
  );
  const [donation, setDonation] = useState(
    payment ? String(payment.donationAmount || "") : String(donationSuggested || "")
  );
  // Una volta che l'admin scrive, il campo è suo: nessun suggerimento lo sovrascrive.
  const [amountEdited, setAmountEdited] = useState(false);
  const [donationEdited, setDonationEdited] = useState(false);

  function handleSubscriptionChange(id: string) {
    setSelected(id);
    const next = subscriptions?.find((option) => option._id === id);
    if (!next) return;
    if (!amountEdited) {
      setAmount(String(next.outstanding > 0 ? next.outstanding : next.totalDue));
    }
    if (!donationEdited) setDonation(String(next.donationSupplement || ""));
  }

  const entered = Number(amount);
  const missing =
    Number.isFinite(entered) && entered > 0 && suggestedAmount > 0
      ? Math.round((suggestedAmount - entered) * 100) / 100
      : 0;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) {
      setError("Seleziona l'abbonamento a cui imputare il pagamento.");
      return;
    }
    setPending(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const result = await submitJson(
      payment
        ? `/api/subscriptions/${selected}/payments/${payment._id}`
        : `/api/subscriptions/${selected}/payments`,
      payment ? "PATCH" : "POST",
      {
        amount: Number(amount),
        donationAmount: Number(donation || 0),
        paidAt: String(form.get("paidAt")),
        method: String(form.get("method")),
        reference: String(form.get("reference") ?? ""),
        notes: String(form.get("notes") ?? ""),
      },
      payment ? "Modifica non riuscita. Riprova." : "Registrazione non riuscita. Riprova."
    );

    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    // La scadenza e lo stato sono ricalcolati lato server: ricarico i dati.
    if (onSuccess) onSuccess(payment ? "Pagamento aggiornato" : "Pagamento registrato");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
      <div className="grid gap-4 sm:grid-cols-2">
        {chooseSubscription ? (
          <div className="sm:col-span-2">
            {/* Non usa Field: quello avvolge i figli in un <label>, e un label
                che contiene bottoni e una listbox ne dirotta i clic. */}
            <span className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">
              Abbonamento
            </span>
            <SubscriptionPicker
              options={subscriptions ?? []}
              value={selected}
              onChange={handleSubscriptionChange}
            />
          </div>
        ) : null}

        <Field
          label="Importo incassato"
          hint={
            outstanding > 0
              ? `Residuo del ciclo ${formatEUR(outstanding)} su ${formatEUR(expected)} dovuti`
              : expected > 0
                ? `Dovuto per il ciclo ${formatEUR(expected)}`
                : undefined
          }
        >
          <TextInput
            type="number"
            name="amount"
            step="0.01"
            min="0"
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value);
              setAmountEdited(true);
            }}
            required
          />
        </Field>

        <Field label="di cui donazione">
          <TextInput
            type="number"
            name="donationAmount"
            step="0.01"
            min="0"
            value={donation}
            onChange={(event) => {
              setDonation(event.target.value);
              setDonationEdited(true);
            }}
          />
        </Field>

        <Field label="Data del pagamento">
          <TextInput
            type="date"
            name="paidAt"
            defaultValue={toDateInputValue(payment ? new Date(payment.paidAt) : new Date())}
            required
          />
        </Field>

        <Field label="Metodo">
          <Select name="method" defaultValue={payment?.method ?? "bonifico"}>
            {METHODS.map((method) => (
              <option key={method.value} value={method.value}>
                {method.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Riferimento" hint="Numero CRO, ID transazione">
          <TextInput type="text" name="reference" defaultValue={payment?.reference ?? ""} />
        </Field>

        <Field label="Note">
          <TextInput type="text" name="notes" defaultValue={payment?.notes ?? ""} />
        </Field>
      </div>

      {/* L'incasso parziale è registrato com'è: qui si dice solo cosa resta. */}
      {missing > 0 ? (
        <p className="text-sm" style={{ color: "var(--status-warn)" }}>
          Mancheranno {formatEUR(missing)} per chiudere il ciclo. Il pagamento viene
          registrato per l&apos;importo indicato.
        </p>
      ) : null}
      {missing < 0 ? (
        <p className="text-sm text-[var(--ink-muted)]">
          L&apos;importo supera di {formatEUR(Math.abs(missing))} quanto dovuto per il ciclo.
        </p>
      ) : null}

      {error ? <ErrorMessage>{error}</ErrorMessage> : null}

      <button type="submit" disabled={pending} className={buttonPrimary}>
        {editing
          ? pending
            ? "Salvataggio in corso"
            : "Salva modifiche"
          : pending
            ? "Registrazione in corso"
            : "Registra pagamento"}
      </button>
    </form>
  );
}
