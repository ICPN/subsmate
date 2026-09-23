"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/Modal";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ServiceForm, type ServiceFormValues } from "@/components/ServiceForm";
import { useToast } from "@/components/Toast";
import { buttonPrimary, buttonSecondary } from "@/components/ui";

export function NewServiceButton() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const showToast = useToast();

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonPrimary}>
        Aggiungi servizio
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Nuovo servizio">
        <ServiceForm
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

export function ServiceRowActions({ service }: { service: ServiceFormValues }) {
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const router = useRouter();
  const showToast = useToast();

  async function handleDelete() {
    const response = await fetch(`/api/services/${service._id}`, { method: "DELETE" });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.error ?? "Eliminazione non riuscita.");
    }
    setConfirmOpen(false);
    showToast("Servizio eliminato");
    router.refresh();
  }

  return (
    <div className="flex justify-end gap-2">
      <button type="button" onClick={() => setEditOpen(true)} className={buttonSecondary}>
        Modifica
      </button>
      <button type="button" onClick={() => setConfirmOpen(true)} className={buttonSecondary}>
        Elimina
      </button>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Modifica servizio">
        <ServiceForm
          initialValues={service}
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
        title="Eliminare il servizio?"
        message={`"${service.name}" verrà eliminato definitivamente. Se è usato da qualche abbonamento l'operazione verrà bloccata.`}
        confirmLabel="Elimina servizio"
        onConfirm={handleDelete}
      />
    </div>
  );
}
