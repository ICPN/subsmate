import { PAYMENT_STATUS_LABELS, type PaymentStatus } from "@/lib/billing";

/**
 * Pillola di stato: sfondo del colore di stato al 12%, testo a piena saturazione,
 * sentence case (§6). I quattro colori non sono usati altrove nell'interfaccia.
 */

const COLORS: Record<PaymentStatus, string> = {
  in_regola: "var(--status-ok)",
  in_scadenza: "var(--status-warn)",
  in_ritardo: "var(--status-critical)",
  da_attivare: "var(--status-neutral)",
};

export function StatusBadge({ status }: { status: PaymentStatus }) {
  const color = COLORS[status];
  return (
    <span
      className="inline-flex items-center whitespace-nowrap rounded-[var(--radius)] px-2 py-0.5 text-xs font-medium"
      style={{
        color,
        // 1f in esadecimale ≈ 12% di opacità, come da guidelines.
        backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
      }}
    >
      {PAYMENT_STATUS_LABELS[status]}
    </span>
  );
}

/** Pillola neutra per etichette brevi non legate allo stato (servizio, periodicità). */
export function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-[var(--radius)] bg-[var(--surface)] px-2 py-0.5 text-xs font-medium text-[var(--ink-muted)]">
      {children}
    </span>
  );
}
