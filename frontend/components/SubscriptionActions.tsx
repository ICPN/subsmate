"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/Modal";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { SubscriptionForm, type SubscriptionFormValues } from "@/components/SubscriptionForm";
import { useToast } from "@/components/Toast";
import { buttonPrimary, buttonSecondary } from "@/components/ui";
import { formatEUR } from "@/lib/billing";

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

export function NewSubscriptionButton({
  people,
  services,
}: {
  people: PersonOption[];
  services: ServiceOption[];
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const showToast = useToast();

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonPrimary}>
        Aggiungi abbonamento
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Nuovo abbonamento">
        <SubscriptionForm
          people={people}
          services={services}
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
 * Azioni di riga, riusate anche nell'header della pagina di dettaglio
 * abbonamento: lì `redirectOnDeleteTo` porta l'admin fuori dalla pagina
 * appena cancellata invece di limitarsi a un router.refresh() che la
 * farebbe risultare 404.
 */
export function SubscriptionRowActions({
  subscription,
  people,
  services,
  redirectOnDeleteTo,
}: {
  subscription: SubscriptionFormValues;
  people: PersonOption[];
  services: ServiceOption[];
  redirectOnDeleteTo?: string;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState("");
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmError, setConfirmError] = useState(false);
  const router = useRouter();
  const showToast = useToast();

  async function openConfirm() {
    setConfirmLoading(true);
    setConfirmError(false);
    setConfirmOpen(true);
    try {
      const response = await fetch(`/api/subscriptions/${subscription._id}`);
      if (!response.ok) {
        setConfirmError(true);
        setConfirmMessage("Impossibile verificare lo storico pagamenti. Riprova.");
        return;
      }
      const body = await response.json().catch(() => null);
      const payments = (body?.data?.payments ?? []) as { amount: number }[];
      const total = payments.reduce((sum, payment) => sum + payment.amount, 0);
      setConfirmMessage(
        payments.length > 0
          ? `Verranno eliminati anche ${payments.length} ${
              payments.length === 1 ? "pagamento registrato" : "pagamenti registrati"
            }, totale storico ${formatEUR(total)}.`
          : "Non ha pagamenti registrati."
      );
    } catch {
      setConfirmError(true);
      setConfirmMessage("Impossibile verificare lo storico pagamenti. Riprova.");
    } finally {
      setConfirmLoading(false);
    }
  }

  async function handleDelete() {
    const response = await fetch(`/api/subscriptions/${subscription._id}`, { method: "DELETE" });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.error ?? "Eliminazione non riuscita.");
    }
    setConfirmOpen(false);
    showToast("Abbonamento eliminato");
    if (redirectOnDeleteTo) {
      router.push(redirectOnDeleteTo);
    } else {
      router.refresh();
    }
  }

  return (
    <div className="flex justify-end gap-2">
      <button type="button" onClick={() => setEditOpen(true)} className={buttonSecondary}>
        Modifica
      </button>
      <button type="button" onClick={openConfirm} className={buttonSecondary}>
        Elimina
      </button>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Modifica abbonamento">
        <SubscriptionForm
          people={people}
          services={services}
          initialValues={subscription}
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
        title="Eliminare l'abbonamento?"
        message={confirmLoading ? "Verifica dello storico pagamenti…" : confirmMessage}
        confirmLabel="Elimina abbonamento"
        confirmDisabled={confirmLoading || confirmError}
        onConfirm={handleDelete}
      />
    </div>
  );
}
