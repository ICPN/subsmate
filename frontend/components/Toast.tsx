"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

/** Notifica minimale, auto-dismiss: conferma dopo un salvataggio dentro un modale. */

type ToastState = { id: number; message: string };

const ToastContext = createContext<((message: string) => void) | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback((message: string) => {
    const id = Date.now();
    setToast({ id, message });
    setTimeout(() => {
      setToast((current) => (current?.id === id ? null : current));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-x-0 bottom-4 z-[60] flex justify-center px-4 sm:justify-end sm:right-4 sm:px-0"
        >
          <div className="rounded-[var(--radius)] bg-[var(--ink-navy)] px-4 py-3 text-sm text-white shadow-lg">
            {toast.message}
          </div>
        </div>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): (message: string) => void {
  const showToast = useContext(ToastContext);
  if (!showToast) throw new Error("useToast va usato dentro <ToastProvider>");
  return showToast;
}
