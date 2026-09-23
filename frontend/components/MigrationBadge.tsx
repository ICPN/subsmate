import type { MigrationAlert } from "@/lib/migration";

/**
 * Avviso compatto per le righe di elenco e la dashboard.
 *
 * Usa i colori di stato perché quello che segnala è uno stato vero, non una
 * decorazione: le brand guidelines vietano di riusarli per bottoni e link,
 * non per gli stati.
 */
export function MigrationBadge({ alert }: { alert: MigrationAlert | null }) {
  if (!alert) return null;
  const color = alert.kind === "in_ritardo" ? "var(--status-critical)" : "var(--status-warn)";
  return (
    <span
      className="mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ color, border: `1px solid ${color}` }}
    >
      {alert.label}
    </span>
  );
}
