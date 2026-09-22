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
