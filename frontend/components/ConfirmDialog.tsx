"use client";

import { useState, type ReactNode } from "react";
import { Modal } from "@/components/Modal";
import { buttonPrimary, buttonSecondary } from "@/components/ui";
import { ErrorMessage } from "@/components/form";

/**
 * Dialog di conferma per le eliminazioni. Nessun bottone "danger" rosso: il
 * rischio si comunica col testo di `message`, i colori di stato restano
 * riservati al pagamento (brand-guidelines.md §3).
 */
export function ConfirmDialog({
  open,
  onClose,
  title,
  message,
  confirmLabel,
  confirmDisabled = false,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  confirmDisabled?: boolean;
  onConfirm: () => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Azzera l'errore del tentativo precedente quando il dialog si riapre,
  // aggiustando lo stato durante il render invece che in un useEffect
  // (pattern raccomandato da React per "resettare stato quando cambia un
  // prop", evita anche il giro di render in più di un effect).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setError(null);
  }

  async function handleConfirm() {
    setPending(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Operazione non riuscita. Riprova.");
      setPending(false);
      return;
    }
    setPending(false);
  }

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-4 px-5 py-5">
        <div className="text-sm text-[var(--ink-muted)]">{message}</div>
        {error ? <ErrorMessage>{error}</ErrorMessage> : null}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className={buttonSecondary} disabled={pending}>
            Annulla
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={pending || confirmDisabled}
            className={buttonPrimary}
          >
            {pending ? "In corso…" : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
