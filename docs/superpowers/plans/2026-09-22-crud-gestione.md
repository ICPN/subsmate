# CRUD gestione entità Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendere gestibili da interfaccia Persone, Servizi, Abbonamenti e Pagamenti — oggi di sola lettura — con creazione/modifica/eliminazione via modali responsivi.

**Architecture:** Le liste restano Server Component (fetch via `lib/queries.ts`, invariato). Ogni pagina guadagna componenti client piccoli e mirati (bottone "Aggiungi", `RowActions` per riga) che aprono un `<Modal>` riusabile con un form dentro, salvano con `fetch()` verso l'API REST già esistente, poi chiudono il modale, mostrano un toast e chiamano `router.refresh()`. Stesso pattern già in uso in `RegisterPaymentForm`, esteso a Servizi, Persone, Abbonamenti, più la cancellazione di un Pagamento (nuovo endpoint).

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, Mongoose 9, Zod 4. Nessuna nuova dipendenza.

**Spec:** `docs/superpowers/specs/2026-09-22-crud-gestione-design.md`

## Global Constraints

- Nessun framework di test nel repo (scelta esplicita, non introdurne uno). Verifica: `npm run build` (include il typecheck TypeScript) + `npm run lint` + prova manuale nel browser.
- Interfaccia in italiano; verbo all'inizio per le azioni ("Aggiungi persona", non "Nuova persona +"); nessuna freccia decorativa; nessuna etichetta tutta maiuscola.
- I quattro colori di stato (`--status-ok/warn/critical/neutral`) non vanno **mai** riusati per bottoni, link o decorazione — nessun bottone "danger" rosso per le eliminazioni: il rischio si comunica col testo del messaggio, non col colore.
- Bordi sottili (`--border`, 1px) al posto delle ombre; le ombre restano riservate a modali/overlay.
- Manrope per titoli/numeri (`--font-manrope`), Inter per testo/tabelle; `tnum`/`font-variant-numeric: tabular-nums` su importi e date.
- Nessun tema scuro sulle pagine di dati.
- Ogni pagina sotto `app/(protected)/` chiama `await requireAdmin(<percorso>)` come prima istruzione — pattern esistente, da preservare in ogni modifica.
- Ogni route sotto `app/api/` resta avvolta in `withAdmin()`.
- `frontend/lib/queries.ts` resta l'unica fonte di lettura per le Server Component: nessuna pagina chiama le proprie API via HTTP.
- Nulla di calcolabile (quota, totale dovuto, prossima scadenza, stato pagamento) va mai scritto nel database o esposto come campo di un form.
- Next.js 16: `params`/`searchParams` sono `Promise` e vanno attesi (pattern già in uso).
- Alias `@/` punta a `frontend/` (tsconfig paths, già in uso).
- Ogni valore passato da una Server Component a una Client Component deve essere serializzabile: `String(_id)` per gli ObjectId, stringhe `yyyy-mm-dd` per le date nei form (mai oggetti `Date` o `ObjectId` grezzi).

---

## File Structure

**Nuovi file:**

| File | Responsabilità |
|---|---|
| `frontend/components/form.tsx` | Primitive di form condivise: `Field`, `TextInput`, `NumberInput`, `Select`, `Textarea`, `Checkbox`, `ErrorMessage`, `inputClass` |
| `frontend/components/Modal.tsx` | Dialog riusabile, responsivo (centrato desktop / foglio in basso sotto i 640px) |
| `frontend/components/ConfirmDialog.tsx` | Dialog di conferma costruito su `Modal`, con stato di caricamento ed errore propri |
| `frontend/components/Toast.tsx` | `ToastProvider` + hook `useToast()` |
| `frontend/components/ServiceForm.tsx` | Form create/edit Servizio |
| `frontend/components/ServiceActions.tsx` | `NewServiceButton`, `ServiceRowActions` |
| `frontend/components/PersonForm.tsx` | Form create/edit Persona |
| `frontend/components/PersonActions.tsx` | `NewPersonButton`, `PersonRowActions` |
| `frontend/components/SubscriptionForm.tsx` | Form create/edit Abbonamento |
| `frontend/components/SubscriptionActions.tsx` | `NewSubscriptionButton`, `SubscriptionRowActions` |
| `frontend/components/PaymentRowActions.tsx` | Azione di cancellazione per una riga di pagamento (riusata in due pagine) |
| `frontend/app/api/subscriptions/[id]/payments/[paymentId]/route.ts` | `DELETE` — cancella un pagamento e ricalcola `lastPaymentDate` |

**File modificati:**

| File | Cosa cambia |
|---|---|
| `frontend/components/RegisterPaymentForm.tsx` | Importa `Field`/`inputClass`/`ErrorMessage` da `components/form.tsx` invece di definirli localmente |
| `frontend/app/(protected)/layout.tsx` | Monta `<ToastProvider>` attorno al contenuto |
| `frontend/app/(protected)/servizi/page.tsx` | Bottone "Aggiungi servizio", colonna Azioni |
| `frontend/app/(protected)/persone/page.tsx` | Bottone "Aggiungi persona", colonna Azioni |
| `frontend/app/(protected)/abbonamenti/page.tsx` | Bottone "Aggiungi abbonamento", colonna Azioni (richiede anche `listPeople()`) |
| `frontend/app/(protected)/abbonamenti/[id]/page.tsx` | Azioni modifica/elimina abbonamento nell'header, azione elimina per riga nello storico pagamenti |
| `frontend/app/(protected)/pagamenti/page.tsx` | Colonna Azioni (elimina) per riga |

---

### Task 1: Primitive di form condivise

**Files:**
- Create: `frontend/components/form.tsx`
- Modify: `frontend/components/RegisterPaymentForm.tsx`

**Interfaces:**
- Produces: `Field({label, hint?, children})`, `TextInput(props: InputHTMLAttributes<HTMLInputElement>)`, `Select(props: SelectHTMLAttributes<HTMLSelectElement>)`, `Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>)`, `Checkbox({label, ...props}: InputHTMLAttributes<HTMLInputElement> & {label: string})`, `ErrorMessage({children}: {children: ReactNode})`, `inputClass: string` — tutti da `@/components/form`, usati da ogni task successivo.

- [ ] **Step 1: Crea `frontend/components/form.tsx`**

```tsx
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

/**
 * Primitive di form condivise da tutti i form create/edit.
 * Stesso stile di RegisterPaymentForm, estratto qui per non duplicarlo.
 */

export const inputClass =
  "w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink-navy)]";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-[var(--ink-muted)]">{hint}</span> : null}
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={inputClass} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={inputClass} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...props} className={inputClass} />;
}

export function Checkbox({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        {...props}
        className="h-4 w-4 rounded border-[var(--border)] text-[var(--ink-navy)]"
      />
      {label}
    </label>
  );
}

export function ErrorMessage({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-[var(--radius)] px-3 py-2 text-sm"
      style={{
        color: "var(--status-critical)",
        backgroundColor: "color-mix(in srgb, var(--status-critical) 12%, transparent)",
      }}
    >
      {children}
    </p>
  );
}
```

- [ ] **Step 2: Aggiorna `frontend/components/RegisterPaymentForm.tsx` per usare le primitive condivise**

Sostituisci l'intero file con:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { buttonPrimary } from "@/components/ui";
import { Field, TextInput, Select, ErrorMessage } from "@/components/form";

/**
 * Form di registrazione pagamento.
 * Importo e donazione sono precompilati con i valori calcolati: l'admin conferma
 * e basta nel caso normale, e li corregge solo se l'incasso è stato diverso.
 */

const METHODS = [
  { value: "bonifico", label: "Bonifico" },
  { value: "contanti", label: "Contanti" },
  { value: "paypal", label: "PayPal" },
  { value: "satispay", label: "Satispay" },
  { value: "altro", label: "Altro" },
];

export function RegisterPaymentForm({
  subscriptionId,
  defaultAmount,
  defaultDonation,
}: {
  subscriptionId: string;
  defaultAmount: number;
  defaultDonation: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/subscriptions/${subscriptionId}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: Number(form.get("amount")),
        donationAmount: Number(form.get("donationAmount")),
        paidAt: String(form.get("paidAt")),
        method: String(form.get("method")),
        reference: String(form.get("reference") ?? ""),
        notes: String(form.get("notes") ?? ""),
      }),
    });

    setPending(false);

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error ?? "Registrazione non riuscita. Riprova.");
      return;
    }

    // La scadenza e lo stato sono ricalcolati lato server: ricarico i dati.
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Importo incassato" hint="Precompilato con il totale dovuto">
          <TextInput
            type="number"
            name="amount"
            step="0.01"
            min="0"
            defaultValue={defaultAmount}
            required
          />
        </Field>

        <Field label="di cui donazione">
          <TextInput
            type="number"
            name="donationAmount"
            step="0.01"
            min="0"
            defaultValue={defaultDonation}
          />
        </Field>

        <Field label="Data del pagamento">
          <TextInput
            type="date"
            name="paidAt"
            defaultValue={new Date().toISOString().slice(0, 10)}
            required
          />
        </Field>

        <Field label="Metodo">
          <Select name="method" defaultValue="bonifico">
            {METHODS.map((method) => (
              <option key={method.value} value={method.value}>
                {method.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Riferimento" hint="Numero CRO, ID transazione">
          <TextInput type="text" name="reference" />
        </Field>

        <Field label="Note">
          <TextInput type="text" name="notes" />
        </Field>
      </div>

      {error ? <ErrorMessage>{error}</ErrorMessage> : null}

      <button type="submit" disabled={pending} className={buttonPrimary}>
        {pending ? "Registrazione in corso" : "Registra pagamento"}
      </button>
    </form>
  );
}
```

Nota: il comportamento è identico a prima (stessi campi, stessa richiesta), solo `Field`/`ErrorMessage`/`inputClass` ora vengono da `components/form.tsx`.

- [ ] **Step 3: Verifica**

Run: `cd frontend && npx tsc --noEmit`
Expected: nessun errore.

Run: `cd frontend && npm run lint`
Expected: nessun errore.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/form.tsx frontend/components/RegisterPaymentForm.tsx
git commit -m "refactor(ui): estrae le primitive di form condivise da RegisterPaymentForm"
```

---

### Task 2: Modal, ConfirmDialog, Toast

**Files:**
- Create: `frontend/components/Modal.tsx`
- Create: `frontend/components/ConfirmDialog.tsx`
- Create: `frontend/components/Toast.tsx`
- Modify: `frontend/app/(protected)/layout.tsx`

**Interfaces:**
- Consumes: `buttonPrimary`, `buttonSecondary` da `@/components/ui` (Task 0, già esistenti); `ErrorMessage` da `@/components/form` (Task 1).
- Produces: `Modal({open, onClose, title, children})`, `ConfirmDialog({open, onClose, title, message, confirmLabel, confirmDisabled?, onConfirm})`, `ToastProvider({children})`, `useToast(): (message: string) => void` — usati da tutti i task successivi.

- [ ] **Step 1: Crea `frontend/components/Modal.tsx`**

```tsx
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
```

- [ ] **Step 2: Crea `frontend/components/ConfirmDialog.tsx`**

```tsx
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
```

- [ ] **Step 3: Crea `frontend/components/Toast.tsx`**

```tsx
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
```

- [ ] **Step 4: Monta `ToastProvider` in `frontend/app/(protected)/layout.tsx`**

Sostituisci l'intero file con:

```tsx
import { requireAdmin } from "@/lib/requireAdmin";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ToastProvider } from "@/components/Toast";

/**
 * Controllo autorevole per tutte le pagine dell'app in un punto solo.
 * Il route group non cambia gli URL: le parentesi non sono un segmento di percorso.
 * Header e Footer stanno qui (non nel root layout) così la pagina /login,
 * che eredita solo app/layout.tsx, non li mostra a un utente non autenticato.
 */
export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <ToastProvider>
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">{children}</main>
        <Footer />
      </div>
    </ToastProvider>
  );
}
```

- [ ] **Step 5: Verifica**

Run: `cd frontend && npx tsc --noEmit && npm run lint`
Expected: nessun errore. La verifica visiva di `Modal`/`ConfirmDialog`/`Toast` avviene nel Task 3, dove ottengono il primo consumatore reale (`ServiceForm`).

- [ ] **Step 6: Commit**

```bash
git add frontend/components/Modal.tsx frontend/components/ConfirmDialog.tsx frontend/components/Toast.tsx "frontend/app/(protected)/layout.tsx"
git commit -m "feat(ui): aggiunge Modal, ConfirmDialog e Toast riusabili"
```

---

### Task 3: CRUD Servizi

**Files:**
- Create: `frontend/components/ServiceForm.tsx`
- Create: `frontend/components/ServiceActions.tsx`
- Modify: `frontend/app/(protected)/servizi/page.tsx`

**Interfaces:**
- Consumes: `Field, TextInput, Textarea, Checkbox, ErrorMessage` (Task 1); `Modal, ConfirmDialog, useToast` (Task 2); `buttonPrimary, buttonSecondary` (esistenti in `@/components/ui`).
- Produces: `ServiceFormValues` (`{_id?, name, monthlyRate, billingDayOfMonth, active, notes}`), `ServiceForm({initialValues?, onSuccess})`, `NewServiceButton()`, `ServiceRowActions({service: ServiceFormValues})`.

- [ ] **Step 1: Crea `frontend/components/ServiceForm.tsx`**

```tsx
"use client";

import { useState, type FormEvent } from "react";
import { Field, TextInput, Textarea, Checkbox, ErrorMessage } from "@/components/form";
import { buttonPrimary } from "@/components/ui";

export interface ServiceFormValues {
  _id?: string;
  name: string;
  monthlyRate: number;
  billingDayOfMonth: number;
  active: boolean;
  notes: string;
}

/**
 * Form create/edit Servizio. Lo slug non è mai nel form: resta generato
 * lato server da slugify(name), sia in creazione che (invariato) in modifica.
 */
export function ServiceForm({
  initialValues,
  onSuccess,
}: {
  initialValues?: ServiceFormValues;
  onSuccess: (message: string) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEdit = Boolean(initialValues?._id);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get("name")),
      monthlyRate: Number(form.get("monthlyRate")),
      billingDayOfMonth: Number(form.get("billingDayOfMonth")),
      active: form.get("active") === "on",
      notes: String(form.get("notes") ?? ""),
    };

    const url = isEdit ? `/api/services/${initialValues!._id}` : "/api/services";
    const response = await fetch(url, {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setPending(false);

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error ?? "Salvataggio non riuscito. Riprova.");
      return;
    }

    onSuccess(isEdit ? "Servizio aggiornato" : "Servizio creato");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome">
          <TextInput name="name" defaultValue={initialValues?.name} required />
        </Field>
        <Field label="Tariffa mensile (€)">
          <TextInput
            type="number"
            step="0.01"
            min={0}
            name="monthlyRate"
            defaultValue={initialValues?.monthlyRate ?? 0}
            required
          />
        </Field>
        <Field label="Giorno addebito" hint="1–31">
          <TextInput
            type="number"
            min={1}
            max={31}
            name="billingDayOfMonth"
            defaultValue={initialValues?.billingDayOfMonth ?? 1}
            required
          />
        </Field>
        <Field label="Note">
          <Textarea name="notes" defaultValue={initialValues?.notes} />
        </Field>
      </div>

      <Checkbox name="active" label="Attivo" defaultChecked={initialValues?.active ?? true} />

      {error ? <ErrorMessage>{error}</ErrorMessage> : null}

      <button type="submit" disabled={pending} className={buttonPrimary}>
        {pending ? "Salvataggio in corso" : isEdit ? "Salva modifiche" : "Aggiungi servizio"}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Crea `frontend/components/ServiceActions.tsx`**

```tsx
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
```

- [ ] **Step 3: Aggiorna `frontend/app/(protected)/servizi/page.tsx`**

Aggiungi gli import (in cima al file, dopo gli import esistenti):

```tsx
import { NewServiceButton, ServiceRowActions } from "@/components/ServiceActions";
```

Cambia l'apertura di `PageHeader` (riga 28-31) da:

```tsx
      <PageHeader
        title="Servizi"
        description="Tariffe dei servizi LLM. Aggiungere un servizio non richiede modifiche al codice: è un record in più."
      />
```

a:

```tsx
      <PageHeader
        title="Servizi"
        description="Tariffe dei servizi LLM. Aggiungere un servizio non richiede modifiche al codice: è un record in più."
        action={<NewServiceButton />}
      />
```

Aggiungi la colonna "Azioni" nell'intestazione tabella (dopo `<Th>Stato</Th>`, riga 51):

```tsx
                  <Th>Stato</Th>
                  <Th align="right">Azioni</Th>
```

Aggiungi la cella azioni nella riga (dopo la cella Stato, prima della chiusura `</tr>`, riga 80-82):

```tsx
                      <Td>
                        <Pill>{service.active ? "Attivo" : "Disattivato"}</Pill>
                      </Td>
                      <Td align="right">
                        <ServiceRowActions
                          service={{
                            _id: String(service._id),
                            name: service.name,
                            monthlyRate: service.monthlyRate,
                            billingDayOfMonth: service.billingDayOfMonth ?? 1,
                            active: service.active ?? true,
                            notes: service.notes ?? "",
                          }}
                        />
                      </Td>
```

- [ ] **Step 4: Verifica**

Run: `cd frontend && npx tsc --noEmit && npm run lint`
Expected: nessun errore.

Poi nel browser (`npm run dev`, o il tool di preview):
1. Apri `/servizi`. Clicca "Aggiungi servizio", compila nome/tariffa/giorno addebito, salva: il modale si chiude, appare il toast "Servizio creato", la riga compare in tabella.
2. Clicca "Modifica" su una riga, cambia la tariffa, salva: la riga si aggiorna.
3. Prova a eliminare un servizio usato da un abbonamento (es. Claude): il dialog mostra l'errore 409 dell'API senza chiudersi.
4. Riduci la finestra sotto i 640px (o `resize_window` col tool di preview): il modale diventa un foglio a tutta larghezza ancorato in basso, resta usabile senza scroll orizzontale.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/ServiceForm.tsx frontend/components/ServiceActions.tsx "frontend/app/(protected)/servizi/page.tsx"
git commit -m "feat(servizi): aggiunge creazione, modifica ed eliminazione da UI"
```

---

### Task 4: CRUD Persone

**Files:**
- Create: `frontend/components/PersonForm.tsx`
- Create: `frontend/components/PersonActions.tsx`
- Modify: `frontend/app/(protected)/persone/page.tsx`

**Interfaces:**
- Consumes: `Field, TextInput, Textarea, Checkbox, ErrorMessage` (Task 1); `Modal, ConfirmDialog, useToast` (Task 2).
- Produces: `PersonFormValues` (`{_id?, firstName, lastName, email, active, notes}`), `PersonForm({initialValues?, onSuccess})`, `NewPersonButton()`, `PersonRowActions({person: PersonFormValues})`.

- [ ] **Step 1: Crea `frontend/components/PersonForm.tsx`**

```tsx
"use client";

import { useState, type FormEvent } from "react";
import { Field, TextInput, Textarea, Checkbox, ErrorMessage } from "@/components/form";
import { buttonPrimary } from "@/components/ui";

export interface PersonFormValues {
  _id?: string;
  firstName: string;
  lastName: string;
  email: string;
  active: boolean;
  notes: string;
}

export function PersonForm({
  initialValues,
  onSuccess,
}: {
  initialValues?: PersonFormValues;
  onSuccess: (message: string) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEdit = Boolean(initialValues?._id);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const payload = {
      firstName: String(form.get("firstName")),
      lastName: String(form.get("lastName")),
      email: String(form.get("email")),
      active: form.get("active") === "on",
      notes: String(form.get("notes") ?? ""),
    };

    const url = isEdit ? `/api/people/${initialValues!._id}` : "/api/people";
    const response = await fetch(url, {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setPending(false);

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error ?? "Salvataggio non riuscito. Riprova.");
      return;
    }

    onSuccess(isEdit ? "Persona aggiornata" : "Persona creata");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome">
          <TextInput name="firstName" defaultValue={initialValues?.firstName} required />
        </Field>
        <Field label="Cognome">
          <TextInput name="lastName" defaultValue={initialValues?.lastName} required />
        </Field>
        <Field label="Email">
          <TextInput type="email" name="email" defaultValue={initialValues?.email} required />
        </Field>
        <Field label="Note">
          <Textarea name="notes" defaultValue={initialValues?.notes} />
        </Field>
      </div>

      <Checkbox name="active" label="Attiva" defaultChecked={initialValues?.active ?? true} />

      {error ? <ErrorMessage>{error}</ErrorMessage> : null}

      <button type="submit" disabled={pending} className={buttonPrimary}>
        {pending ? "Salvataggio in corso" : isEdit ? "Salva modifiche" : "Aggiungi persona"}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Crea `frontend/components/PersonActions.tsx`**

```tsx
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
```

- [ ] **Step 3: Aggiorna `frontend/app/(protected)/persone/page.tsx`**

Aggiungi l'import:

```tsx
import { NewPersonButton, PersonRowActions } from "@/components/PersonActions";
```

Cambia l'apertura di `PageHeader` (righe 37-40) da:

```tsx
      <PageHeader
        title="Persone"
        description="Membri del team e totale dovuto sommato su tutti i loro servizi."
      />
```

a:

```tsx
      <PageHeader
        title="Persone"
        description="Membri del team e totale dovuto sommato su tutti i loro servizi."
        action={<NewPersonButton />}
      />
```

Aggiungi la colonna "Azioni" nell'intestazione tabella (dopo `<Th align="right">Totale dovuto</Th>`, riga 66):

```tsx
                  <Th align="right">Totale dovuto</Th>
                  <Th align="right">Azioni</Th>
```

Aggiungi la cella azioni nella riga (dopo la cella "Totale dovuto", righe 108-110):

```tsx
                      <Td align="right" className="tnum font-medium">
                        {formatEUR(agg.total)}
                      </Td>
                      <Td align="right">
                        <PersonRowActions
                          person={{
                            _id: String(person._id),
                            firstName: person.firstName,
                            lastName: person.lastName,
                            email: person.email,
                            active: person.active ?? true,
                            notes: person.notes ?? "",
                          }}
                        />
                      </Td>
```

- [ ] **Step 4: Verifica**

Run: `cd frontend && npx tsc --noEmit && npm run lint`
Expected: nessun errore.

Nel browser: stesso ciclo del Task 3 (crea, modifica, elimina bloccata da una persona con abbonamenti — es. Yintong Zhou — elimina riuscita su una persona senza abbonamenti se ne crei una di prova).

- [ ] **Step 5: Commit**

```bash
git add frontend/components/PersonForm.tsx frontend/components/PersonActions.tsx "frontend/app/(protected)/persone/page.tsx"
git commit -m "feat(persone): aggiunge creazione, modifica ed eliminazione da UI"
```

---

### Task 5: CRUD Abbonamenti

**Files:**
- Create: `frontend/components/SubscriptionForm.tsx`
- Create: `frontend/components/SubscriptionActions.tsx`
- Modify: `frontend/app/(protected)/abbonamenti/page.tsx`
- Modify: `frontend/app/(protected)/abbonamenti/[id]/page.tsx`

**Interfaces:**
- Consumes: `Field, TextInput, Select, Textarea, ErrorMessage` (Task 1); `Modal, ConfirmDialog, useToast` (Task 2); `formatEUR` da `@/lib/billing` (esistente).
- Produces: `SubscriptionFormValues` (`{_id?, person, personLabel, service, serviceLabel, periodicity, donationSupplement, onboardingStatus, startDate, notes}`), `SubscriptionForm({people, services, initialValues?, onSuccess})`, `NewSubscriptionButton({people, services})`, `SubscriptionRowActions({subscription, people, services, redirectOnDeleteTo?})`.

- [ ] **Step 1: Crea `frontend/components/SubscriptionForm.tsx`**

```tsx
"use client";

import { useState, type FormEvent } from "react";
import { Field, TextInput, Select, Textarea, ErrorMessage } from "@/components/form";
import { buttonPrimary } from "@/components/ui";

const PERIODICITY_OPTIONS = [
  { value: "monthly", label: "Mensile" },
  { value: "quarterly", label: "Trimestrale" },
];

const ONBOARDING_OPTIONS = [
  { value: "da_attivare", label: "Da attivare" },
  { value: "attivo", label: "Attivo" },
  { value: "sospeso", label: "Sospeso" },
  { value: "cessato", label: "Cessato" },
];

export interface SubscriptionFormValues {
  _id?: string;
  person: string;
  personLabel: string;
  service: string;
  serviceLabel: string;
  periodicity: string;
  donationSupplement: number;
  onboardingStatus: string;
  startDate: string; // "yyyy-mm-dd" oppure ""
  notes: string;
}

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

/**
 * Form create/edit Abbonamento. Persona e servizio si scelgono solo in
 * creazione (identificano la coppia unica person+service): in modifica
 * restano testo di sola lettura, coerente con la correzione via
 * cancella-e-reinserisci già usata per i Pagamenti invece che con un
 * cambio di identità dell'abbonamento.
 */
export function SubscriptionForm({
  people,
  services,
  initialValues,
  onSuccess,
}: {
  people: PersonOption[];
  services: ServiceOption[];
  initialValues?: SubscriptionFormValues;
  onSuccess: (message: string) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEdit = Boolean(initialValues?._id);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const startDate = String(form.get("startDate") ?? "");
    const payload: Record<string, unknown> = {
      periodicity: String(form.get("periodicity")),
      donationSupplement: Number(form.get("donationSupplement") ?? 0),
      onboardingStatus: String(form.get("onboardingStatus")),
      startDate: startDate || null,
      notes: String(form.get("notes") ?? ""),
    };
    if (!isEdit) {
      payload.person = String(form.get("person"));
      payload.service = String(form.get("service"));
    }

    const url = isEdit ? `/api/subscriptions/${initialValues!._id}` : "/api/subscriptions";
    const response = await fetch(url, {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setPending(false);

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error ?? "Salvataggio non riuscito. Riprova.");
      return;
    }

    onSuccess(isEdit ? "Abbonamento aggiornato" : "Abbonamento creato");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
      <div className="grid gap-4 sm:grid-cols-2">
        {!isEdit ? (
          <>
            <Field label="Persona">
              <Select name="person" defaultValue="" required>
                <option value="" disabled>
                  Seleziona una persona
                </option>
                {people.map((person) => (
                  <option key={person._id} value={person._id}>
                    {person.lastName} {person.firstName} — {person.email}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Servizio">
              <Select name="service" defaultValue="" required>
                <option value="" disabled>
                  Seleziona un servizio
                </option>
                {services.map((service) => (
                  <option key={service._id} value={service._id}>
                    {service.name}
                  </option>
                ))}
              </Select>
            </Field>
          </>
        ) : (
          <>
            <Field label="Persona">
              <p className="px-3 py-2 text-sm">{initialValues!.personLabel}</p>
            </Field>
            <Field label="Servizio">
              <p className="px-3 py-2 text-sm">{initialValues!.serviceLabel}</p>
            </Field>
          </>
        )}

        <Field label="Periodicità">
          <Select name="periodicity" defaultValue={initialValues?.periodicity ?? "monthly"} required>
            {PERIODICITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Stato onboarding">
          <Select
            name="onboardingStatus"
            defaultValue={initialValues?.onboardingStatus ?? "da_attivare"}
            required
          >
            {ONBOARDING_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Supplemento donazione (€)">
          <TextInput
            type="number"
            step="0.01"
            min={0}
            name="donationSupplement"
            defaultValue={initialValues?.donationSupplement ?? 0}
          />
        </Field>

        <Field label="Data inizio">
          <TextInput type="date" name="startDate" defaultValue={initialValues?.startDate ?? ""} />
        </Field>

        <Field label="Note">
          <Textarea name="notes" defaultValue={initialValues?.notes} />
        </Field>
      </div>

      {error ? <ErrorMessage>{error}</ErrorMessage> : null}

      <button type="submit" disabled={pending} className={buttonPrimary}>
        {pending ? "Salvataggio in corso" : isEdit ? "Salva modifiche" : "Crea abbonamento"}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Crea `frontend/components/SubscriptionActions.tsx`**

```tsx
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
  const router = useRouter();
  const showToast = useToast();

  async function openConfirm() {
    setConfirmLoading(true);
    setConfirmOpen(true);
    const response = await fetch(`/api/subscriptions/${subscription._id}`);
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
    setConfirmLoading(false);
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
        confirmDisabled={confirmLoading}
        onConfirm={handleDelete}
      />
    </div>
  );
}
```

- [ ] **Step 3: Aggiorna `frontend/app/(protected)/abbonamenti/page.tsx`**

Aggiungi gli import (dopo `import { listSubscriptions, listServices } from "@/lib/queries";` diventa):

```tsx
import { listSubscriptions, listServices, listPeople } from "@/lib/queries";
import { NewSubscriptionButton, SubscriptionRowActions } from "@/components/SubscriptionActions";
```

Cambia il fetch dei dati (righe 31-34) da:

```tsx
  const [allSubscriptions, services] = await Promise.all([
    listSubscriptions(service ? { service } : {}),
    listServices(),
  ]);
```

a:

```tsx
  const [allSubscriptions, services, people] = await Promise.all([
    listSubscriptions(service ? { service } : {}),
    listServices(),
    listPeople(),
  ]);

  const peopleOptions = people.map((person) => ({
    _id: String(person._id),
    firstName: person.firstName,
    lastName: person.lastName,
    email: person.email,
  }));
  const serviceOptions = services.map((item) => ({ _id: String(item._id), name: item.name }));
```

Cambia l'apertura di `PageHeader` (righe 54-57) da:

```tsx
      <PageHeader
        title="Abbonamenti"
        description="Una riga per ogni coppia persona × servizio. Quota, scadenza e stato sono calcolati dall'ultimo pagamento registrato."
      />
```

a:

```tsx
      <PageHeader
        title="Abbonamenti"
        description="Una riga per ogni coppia persona × servizio. Quota, scadenza e stato sono calcolati dall'ultimo pagamento registrato."
        action={<NewSubscriptionButton people={peopleOptions} services={serviceOptions} />}
      />
```

Aggiungi la colonna "Azioni" nell'intestazione tabella (dopo `<Th>Stato</Th>`, riga 115):

```tsx
                  <Th>Stato</Th>
                  <Th align="right">Azioni</Th>
```

Aggiungi la cella azioni nella riga (dopo `<StatusBadge status={sub.computed.status} />`, righe 156-158):

```tsx
                    <Td>
                      <StatusBadge status={sub.computed.status} />
                    </Td>
                    <Td align="right">
                      <SubscriptionRowActions
                        subscription={{
                          _id: String(sub._id),
                          person: sub.person ? String(sub.person._id) : "",
                          personLabel: sub.person
                            ? `${sub.person.firstName} ${sub.person.lastName} — ${sub.person.email}`
                            : "Persona rimossa",
                          service: sub.service ? String(sub.service._id) : "",
                          serviceLabel: sub.service?.name ?? "Servizio rimosso",
                          periodicity: sub.periodicity,
                          donationSupplement: sub.donationSupplement,
                          onboardingStatus: sub.onboardingStatus,
                          startDate: sub.startDate
                            ? new Date(sub.startDate).toISOString().slice(0, 10)
                            : "",
                          notes: sub.notes ?? "",
                        }}
                        people={peopleOptions}
                        services={serviceOptions}
                      />
                    </Td>
```

- [ ] **Step 4: Aggiorna `frontend/app/(protected)/abbonamenti/[id]/page.tsx`**

Aggiungi gli import (dopo `import { getSubscriptionDetail } from "@/lib/queries";` diventa):

```tsx
import { getSubscriptionDetail, listPeople, listServices } from "@/lib/queries";
import { SubscriptionRowActions } from "@/components/SubscriptionActions";
```

Nel corpo della funzione, dopo `if (!detail) notFound();` (riga 33), aggiungi il fetch di persone/servizi:

```tsx
  const { subscription: sub, payments } = detail;
  const personName = sub.person ? `${sub.person.firstName} ${sub.person.lastName}` : "Persona rimossa";

  const [people, services] = await Promise.all([listPeople(), listServices()]);
  const peopleOptions = people.map((person) => ({
    _id: String(person._id),
    firstName: person.firstName,
    lastName: person.lastName,
    email: person.email,
  }));
  const serviceOptions = services.map((item) => ({ _id: String(item._id), name: item.name }));
```

(sostituisce le righe 35-36 esistenti, che restano invariate, solo con l'aggiunta sotto).

Cambia `PageHeader` (righe 49-53) da:

```tsx
      <PageHeader
        title={personName}
        description={sub.person?.email}
        action={<StatusBadge status={sub.computed.status} />}
      />
```

a:

```tsx
      <PageHeader
        title={personName}
        description={sub.person?.email}
        action={
          <div className="flex items-center gap-3">
            <StatusBadge status={sub.computed.status} />
            <SubscriptionRowActions
              subscription={{
                _id: String(sub._id),
                person: sub.person ? String(sub.person._id) : "",
                personLabel: personName,
                service: sub.service ? String(sub.service._id) : "",
                serviceLabel: sub.service?.name ?? "Servizio rimosso",
                periodicity: sub.periodicity,
                donationSupplement: sub.donationSupplement,
                onboardingStatus: sub.onboardingStatus,
                startDate: sub.startDate
                  ? new Date(sub.startDate).toISOString().slice(0, 10)
                  : "",
                notes: sub.notes ?? "",
              }}
              people={peopleOptions}
              services={serviceOptions}
              redirectOnDeleteTo="/abbonamenti"
            />
          </div>
        }
      />
```

- [ ] **Step 5: Verifica**

Run: `cd frontend && npx tsc --noEmit && npm run lint`
Expected: nessun errore.

Nel browser:
1. Da `/abbonamenti`, "Aggiungi abbonamento": scegli una persona senza abbonamento su un dato servizio, salva, verifica che compaia con stato "Da attivare".
2. "Modifica" su una riga: verifica che persona e servizio siano testo non modificabile, cambia periodicità o stato onboarding, salva.
3. "Elimina" su un abbonamento con pagamenti (es. uno dei 19 importati da Subs_LLM): il dialog mostra conteggio e totale corretti prima di confermare; dopo, l'abbonamento sparisce dalla lista.
4. Dalla pagina di dettaglio (`/abbonamenti/[id]`) di un abbonamento senza pagamenti storici, usa "Elimina" dall'header: dopo la conferma l'app torna a `/abbonamenti` (non un 404).

- [ ] **Step 6: Commit**

```bash
git add frontend/components/SubscriptionForm.tsx frontend/components/SubscriptionActions.tsx "frontend/app/(protected)/abbonamenti/page.tsx" "frontend/app/(protected)/abbonamenti/[id]/page.tsx"
git commit -m "feat(abbonamenti): aggiunge creazione, modifica ed eliminazione da UI"
```

---

### Task 6: API di cancellazione pagamento

**Files:**
- Create: `frontend/app/api/subscriptions/[id]/payments/[paymentId]/route.ts`

**Interfaces:**
- Consumes: `connectToDatabase` (`@/lib/mongodb`), `Subscription` (`@/models/Subscription`), `Payment` (`@/models/Payment`), `ok, fail, handleError` (`@/lib/api`), `withAdmin` (`@/lib/requireAdmin`) — tutti esistenti, stessa forma delle altre route.
- Produces: `DELETE /api/subscriptions/:id/payments/:paymentId` → `200 { data: { deleted: true, subscription } }` oppure `404` se il pagamento non esiste per quell'abbonamento. Consumato da `PaymentRowActions` (Task 7).

- [ ] **Step 1: Crea `frontend/app/api/subscriptions/[id]/payments/[paymentId]/route.ts`**

```tsx
import { connectToDatabase } from "@/lib/mongodb";
import { Subscription } from "@/models/Subscription";
import { Payment } from "@/models/Payment";
import { ok, fail, handleError } from "@/lib/api";
import { withAdmin } from "@/lib/requireAdmin";

type Context = { params: Promise<{ id: string; paymentId: string }> };

/**
 * DELETE /api/subscriptions/:id/payments/:paymentId — cancella un pagamento
 * registrato per errore (correzione = cancella e reinserisci, mai modifica).
 * Ricalcola lastPaymentDate dell'abbonamento sul pagamento rimasto più
 * recente, o lo svuota se non ne restano. Non tocca onboardingStatus: è un
 * campo gestito manualmente dall'admin, non va sovrascritto da
 * un'operazione sui pagamenti.
 */
async function handleDELETE(_request: Request, { params }: Context) {
  try {
    await connectToDatabase();
    const { id, paymentId } = await params;

    const payment = await Payment.findOne({ _id: paymentId, subscription: id }).lean();
    if (!payment) return fail("Pagamento non trovato", 404);

    await Payment.findByIdAndDelete(paymentId);

    const mostRecent = await Payment.findOne({ subscription: id })
      .sort({ paidAt: -1 })
      .lean();

    const subscription = await Subscription.findByIdAndUpdate(
      id,
      { lastPaymentDate: mostRecent?.paidAt ?? null },
      { new: true }
    ).lean();
    if (!subscription) return fail("Abbonamento non trovato", 404);

    return ok({ deleted: true, subscription });
  } catch (err) {
    return handleError(err);
  }
}

export const DELETE = withAdmin(handleDELETE);
```

- [ ] **Step 2: Verifica**

Run: `cd frontend && npx tsc --noEmit && npm run lint`
Expected: nessun errore.

Verifica manuale con `curl` (richiede un cookie di sessione valido: apri un abbonamento nel browser già loggato, copia il cookie `subsmate_session` dagli strumenti sviluppatore, oppure usa il tool di preview per una richiesta autenticata dal browser stesso):

1. Prendi un `subscriptionId` e `paymentId` reali da MongoDB:
   ```bash
   cd /c/Devs/Personal/subsmate && python -c "
   from execution.db import get_db
   db = get_db()
   p = db.payments.find_one({})
   print(p['subscription'], p['_id'])
   "
   ```
2. Con la sessione admin attiva nel browser, apri `/abbonamenti/<subscriptionId>` e nota `lastPaymentDate` corrente (la data di scadenza mostrata).
3. Questo endpoint viene esercitato davvero da `PaymentRowActions` nel Task 7: la verifica end-to-end (cancellazione + ricalcolo visibile in UI) si fa lì.

- [ ] **Step 3: Commit**

```bash
git add "frontend/app/api/subscriptions/[id]/payments/[paymentId]/route.ts"
git commit -m "feat(api): aggiunge la cancellazione di un pagamento con ricalcolo di lastPaymentDate"
```

---

### Task 7: Cancellazione pagamento in UI

**Files:**
- Create: `frontend/components/PaymentRowActions.tsx`
- Modify: `frontend/app/(protected)/abbonamenti/[id]/page.tsx`
- Modify: `frontend/app/(protected)/pagamenti/page.tsx`

**Interfaces:**
- Consumes: `ConfirmDialog, useToast` (Task 2); `formatEUR, formatDate` (`@/lib/billing`, esistenti); `DELETE /api/subscriptions/:id/payments/:paymentId` (Task 6).
- Produces: `PaymentRowActions({subscriptionId, paymentId, amount, paidAt})`, usato in due pagine.

- [ ] **Step 1: Crea `frontend/components/PaymentRowActions.tsx`**

```tsx
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
```

- [ ] **Step 2: Aggiorna la tabella storico pagamenti in `frontend/app/(protected)/abbonamenti/[id]/page.tsx`**

Aggiungi l'import:

```tsx
import { PaymentRowActions } from "@/components/PaymentRowActions";
```

Aggiungi la colonna "Azioni" nell'intestazione della tabella storico pagamenti (dopo `<Th>Periodo coperto</Th>`, riga 112):

```tsx
                    <Th>Periodo coperto</Th>
                    <Th align="right">Azioni</Th>
```

Aggiungi la cella azioni nella riga (dopo la cella "Periodo coperto", righe 131-133):

```tsx
                      <Td className="tnum text-[var(--ink-muted)]">
                        {formatDate(payment.periodStart)} – {formatDate(payment.periodEnd)}
                      </Td>
                      <Td align="right">
                        <PaymentRowActions
                          subscriptionId={String(sub._id)}
                          paymentId={String(payment._id)}
                          amount={payment.amount}
                          paidAt={new Date(payment.paidAt).toISOString()}
                        />
                      </Td>
```

- [ ] **Step 3: Aggiorna `frontend/app/(protected)/pagamenti/page.tsx`**

Aggiungi l'import:

```tsx
import { PaymentRowActions } from "@/components/PaymentRowActions";
```

Aggiungi la colonna "Azioni" nell'intestazione tabella (dopo `<Th>Riferimento</Th>`, riga 52):

```tsx
                  <Th>Riferimento</Th>
                  <Th align="right">Azioni</Th>
```

Aggiungi la cella azioni nella riga (dopo `<Td className="text-[var(--ink-muted)]">{payment.reference || "—"}</Td>`, riga 86):

```tsx
                      <Td className="text-[var(--ink-muted)]">{payment.reference || "—"}</Td>
                      <Td align="right">
                        <PaymentRowActions
                          subscriptionId={String(payment.subscription)}
                          paymentId={String(payment._id)}
                          amount={payment.amount}
                          paidAt={new Date(payment.paidAt).toISOString()}
                        />
                      </Td>
```

- [ ] **Step 4: Verifica**

Run: `cd frontend && npx tsc --noEmit && npm run lint`
Expected: nessun errore.

Nel browser, su un abbonamento reale con almeno due pagamenti storici (es. uno dei 19 importati da Subs_LLM — se nessuno ne ha più di uno, registra un secondo pagamento di prova da "Registra pagamento" prima di procedere):

1. Apri `/abbonamenti/<id>`, nota la "Prossima scadenza" mostrata (basata sul pagamento più recente).
2. Nella tabella "Storico pagamenti", elimina la riga più recente: il dialog mostra importo e data corretti. Dopo la conferma, il toast conferma, la riga sparisce, e la "Prossima scadenza" nella card sopra si aggiorna al pagamento rimasto (verificalo ricaricando la pagina o osservando `router.refresh()`).
3. Elimina anche l'ultimo pagamento rimasto: verifica che la card torni a mostrare "Nessun pagamento registrato" nello storico.
4. Da `/pagamenti`, elimina un pagamento di un'altra persona da lì e verifica lo stesso comportamento (toast, riga sparita).

- [ ] **Step 5: Commit**

```bash
git add frontend/components/PaymentRowActions.tsx "frontend/app/(protected)/abbonamenti/[id]/page.tsx" "frontend/app/(protected)/pagamenti/page.tsx"
git commit -m "feat(pagamenti): aggiunge la cancellazione di un pagamento da UI"
```

---

### Task 8: Verifica finale end-to-end

**Files:** nessuno (solo verifica).

**Interfaces:** nessuna — consuma tutto quanto prodotto dai Task 1-7.

- [ ] **Step 1: Build completa**

Run: `cd frontend && npm run build`
Expected: build riuscita, nessun errore TypeScript o di rendering statico.

- [ ] **Step 2: Lint**

Run: `cd frontend && npm run lint`
Expected: nessun errore.

- [ ] **Step 3: Giro completo nel browser (dev server)**

Con `npm run dev` (o il tool di preview) e sessione admin attiva, ripeti in sequenza su dati reali (i 24 record importati da Subs_LLM):

1. **Servizi**: crea un servizio di prova ("Test LLM", 5€/mese), modificalo (7€/mese), prova a eliminarlo (riuscito, perché non ha abbonamenti).
2. **Persone**: crea una persona di prova, modificala, eliminala (riuscito, nessun abbonamento).
3. **Abbonamenti**: crea un abbonamento per una persona reale su un servizio esistente, modificane periodicità e stato onboarding, eliminalo verificando il messaggio di conferma corretto (0 pagamenti, quindi "Non ha pagamenti registrati").
4. **Pagamenti**: su un abbonamento reale con storico, registra un pagamento di prova, poi cancellalo dalla tabella e verifica il ricalcolo di `lastPaymentDate`.
5. **Blocchi**: prova a eliminare un servizio realmente in uso (es. Claude) e una persona con abbonamenti reali (es. Yintong Zhou): entrambi devono essere bloccati con il messaggio 409 dell'API, senza cancellazioni parziali.

- [ ] **Step 4: Verifica mobile**

Con `resize_window` (o il pannello dev tools del browser) sotto i 640px, ripeti l'apertura di almeno un modale per entità (Servizio, Persona, Abbonamento) e un `ConfirmDialog`: verifica che diventino fogli a tutta larghezza ancorati in basso, senza scroll orizzontale, con i bottoni raggiungibili.

- [ ] **Step 5: Pulizia dati di prova**

Elimina dal database, via UI, qualsiasi servizio/persona/abbonamento/pagamento di prova creato durante la verifica, per non lasciare rumore nei dati reali appena importati.

- [ ] **Step 6: Commit finale (se necessario)**

Se la verifica ha richiesto correzioni non ancora committate:

```bash
git add -A
git commit -m "fix: correzioni emerse dalla verifica end-to-end del CRUD"
```

Se invece tutti i task precedenti sono già passati senza modifiche aggiuntive, questo step non produce commit.
