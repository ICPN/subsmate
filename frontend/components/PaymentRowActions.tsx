"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { buttonSecondary } from "@/components/ui";
import { formatEUR, formatDate } from "@/lib/billing";

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
        message={`Il pagamento di ${formatEUR(amount)} del ${formatDate(paidAt)} verrà eliminato. Se era il più recente, la prossima scadenza dell'abbonamento verrà ricalcolata sul pagamento precedente.`}
        confirmLabel="Elimina pagamento"
        onConfirm={handleDelete}
      />
    </>
  );
}
