"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/Modal";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PersonForm, type PersonFormValues } from "@/components/PersonForm";
import { useToast } from "@/components/Toast";
import { buttonPrimary, buttonSecondary } from "@/components/ui";

export function NewPersonButton() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const showToast = useToast();

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonPrimary}>
        Aggiungi persona
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Nuova persona">
        <PersonForm
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

export function PersonRowActions({ person }: { person: PersonFormValues }) {
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const router = useRouter();
  const showToast = useToast();

  async function handleDelete() {
    const response = await fetch(`/api/people/${person._id}`, { method: "DELETE" });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.error ?? "Eliminazione non riuscita.");
    }
    setConfirmOpen(false);
    showToast("Persona eliminata");
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

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Modifica persona">
        <PersonForm
          initialValues={person}
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
        title="Eliminare la persona?"
        message={`${person.firstName} ${person.lastName} verrà eliminata definitivamente. Se ha abbonamenti l'operazione verrà bloccata.`}
        confirmLabel="Elimina persona"
        onConfirm={handleDelete}
      />
    </div>
  );
}
