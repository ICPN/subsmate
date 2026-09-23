"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Modal } from "@/components/Modal";
import {
  RegisterPaymentForm,
  type PaymentSubscriptionOption,
} from "@/components/RegisterPaymentForm";
import { useToast } from "@/components/Toast";
import { buttonPrimary, buttonSecondary } from "@/components/ui";
import { formatEUR, formatDate } from "@/lib/billing";

/**
 * Registrazione di un pagamento dalla pagina Pagamenti, dove l'abbonamento non
 * è ancora noto e va scelto. Dalla scheda di un abbonamento si usa invece
 * direttamente RegisterPaymentForm, che lo riceve già.
 */
export function NewPaymentButton({
  subscriptions,
}: {
  subscriptions: PaymentSubscriptionOption[];
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const showToast = useToast();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={buttonPrimary}
        disabled={subscriptions.length === 0}
        title={
          subscriptions.length === 0
            ? "Crea prima un abbonamento a cui imputare il pagamento"
            : undefined
        }
      >
        Registra pagamento
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Registra pagamento">
        <RegisterPaymentForm
          subscriptions={subscriptions}
          onSuccess={(message) => {
            setOpen(false);
            showToast(message);
            router.refresh();
          }}
        />
      </Modal>
    </>
  );
}

export function PaymentRowActions({
  subscriptionId,
  paymentId,
  amount,
  paidAt,
}: {
  subscriptionId: string;
  paymentId: string;
  amount: number;
  paidAt: string;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const router = useRouter();
  const showToast = useToast();

  async function handleDelete() {
    const response = await fetch(
      `/api/subscriptions/${subscriptionId}/payments/${paymentId}`,
      { method: "DELETE" }
    );
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.error ?? "Eliminazione non riuscita.");
    }
    setConfirmOpen(false);
    showToast("Pagamento eliminato");
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        className={`${buttonSecondary} px-2.5 py-1 text-xs`}
      >
        Elimina
      </button>
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Eliminare il pagamento?"
        message={`Il pagamento di ${formatEUR(amount)} del ${formatDate(paidAt)} verrà eliminato. Se era il più recente, la prossima scadenza dell'abbonamento verrà ricalcolata sul pagamento precedente; se è l'unico pagamento registrato, l'abbonamento risulterà senza pagamenti e la scadenza sparirà.`}
        confirmLabel="Elimina pagamento"
        onConfirm={handleDelete}
      />
    </>
  );
}
