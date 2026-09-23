"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Dialog riusabile: overlay scuro + pannello centrato su desktop, foglio a
 * tutta larghezza ancorato in basso sotto i 640px (stesso markup, solo CSS).
 * Le ombre sono riservate a questo componente e a ConfirmDialog, che lo usa
 * (brand-guidelines.md §5: ombre solo per elementi sovrapposti).
 */
export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    dialogRef.current?.focus();
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-[var(--radius)] border border-[var(--border)] bg-[var(--paper)] shadow-lg outline-none sm:max-w-lg sm:rounded-[var(--radius)]"
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <h2
            id="modal-title"
            className="font-[family-name:var(--font-manrope)] text-[18px] font-semibold"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi"
            className="rounded-[var(--radius)] px-2 py-1 text-[var(--ink-muted)] hover:bg-[var(--surface)]"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}
