"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Modal } from "@/components/Modal";
import {
  RegisterPaymentForm,
  type EditablePayment,
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

/**
 * Azioni sulla riga di un pagamento: correzione e cancellazione.
 *
 * La correzione modifica il documento esistente: l'importo, la donazione, la
 * data, il metodo, il riferimento e le note. L'abbonamento a cui è imputato
 * non si cambia — per quello resta la cancellazione seguita da un nuovo
 * inserimento, che è anche l'unico modo di spostare la persona.
 */
export function PaymentRowActions({
  subscriptionId,
  payment,
}: {
  subscriptionId: string;
  payment: EditablePayment;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const router = useRouter();
  const showToast = useToast();

  const { _id: paymentId, amount, paidAt } = payment;

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
      <span className="inline-flex gap-2">
        <button
          type="button"
          onClick={() => setEditOpen(true)}
          className={`${buttonSecondary} px-2.5 py-1 text-xs`}
        >
          Modifica
        </button>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          className={`${buttonSecondary} px-2.5 py-1 text-xs`}
        >
          Elimina
        </button>
      </span>
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Modifica pagamento">
        <RegisterPaymentForm
          subscriptionId={subscriptionId}
          payment={payment}
          onSuccess={(message) => {
            setEditOpen(false);
            showToast(message);
            router.refresh();
          }}
        />
      </Modal>
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
