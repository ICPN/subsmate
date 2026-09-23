"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { buttonPrimary, buttonSecondary } from "@/components/ui";
import { formatDate, formatEUR } from "@/lib/billing";
import type { MigrationView } from "@/lib/queries";

/**
 * Banner sulla scheda dell'abbonamento: dice cosa è pianificato, quanto
 * costa e permette di eseguire o annullare. L'esecuzione è manuale perché
 * non esiste uno scheduler, quindi questo è l'unico punto in cui la
 * migrazione può davvero scattare.
 */
const PERIODICITY_LABELS: Record<string, string> = {
  monthly: "mensile",
  quarterly: "trimestrale",
};

export function MigrationBanner({ migration }: { migration: MigrationView }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const showToast = useToast();

  if (migration.status !== "pianificata") return null;

  const serviceName = migration.toService?.name ?? "servizio rimosso";

  async function execute() {
    setPending(true);
    const response = await fetch(`/api/migrations/${migration._id}/execute`, {
      method: "POST",
    });
    setPending(false);
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      showToast(body?.error ?? "Esecuzione non riuscita");
      return;
    }
    showToast("Migrazione eseguita");
    router.refresh();
  }

  async function cancel() {
    const response = await fetch(`/api/migrations/${migration._id}`, { method: "DELETE" });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.error ?? "Annullamento non riuscito");
    }
    setConfirmOpen(false);
    showToast("Migrazione annullata");
    router.refresh();
  }

  return (
    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
      <p className="text-sm font-medium">
        Passaggio a {serviceName} dal{" "}
        <span className="tnum">{formatDate(migration.effectiveDate)}</span>
      </p>
      <p className="mt-1 text-sm text-[var(--ink-muted)]">
        {migration.closeOld === "alla_decorrenza"
          ? "L'abbonamento attuale cessa alla decorrenza."
          : "L'abbonamento attuale resta attivo fino alla sua scadenza."}
        {migration.toPeriodicity
          ? ` La periodicita passa a ${PERIODICITY_LABELS[migration.toPeriodicity]}.`
          : null}
        {migration.balance
          ? migration.balance.coveredCycles >= 1
            ? ` Il credito copre ${migration.balance.coveredCycles} ${
                migration.balance.coveredCycles === 1 ? "ciclo intero" : "cicli interi"
              }: niente da versare alla decorrenza.`
            : ` Saldo da versare ${formatEUR(migration.balance.saldo)}.`
          : null}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={execute} disabled={pending} className={buttonPrimary}>
          {pending ? "Esecuzione in corso" : "Esegui migrazione"}
        </button>
        <button type="button" onClick={() => setConfirmOpen(true)} className={buttonSecondary}>
          Annulla migrazione
        </button>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Annullare la migrazione?"
        message={`Il passaggio a ${serviceName} non verrà eseguito. L'abbonamento attuale resta com'è, e potrai pianificarne un'altra.`}
        confirmLabel="Annulla migrazione"
        onConfirm={cancel}
      />
    </div>
  );
}
