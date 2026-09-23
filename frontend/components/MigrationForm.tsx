"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { buttonPrimary, buttonSecondary } from "@/components/ui";
import { Field, TextInput, Select, ErrorMessage, submitJson } from "@/components/form";
import {
  effectiveDateFromInput,
  migrationBalance,
  type MigrationCloseOld,
} from "@/lib/migration";
import { formatEUR, toDateInputValue } from "@/lib/billing";
import type { Periodicity } from "@/models/Subscription";

/**
 * Pianificazione del passaggio a un altro servizio.
 *
 * L'anteprima del saldo si aggiorna mentre si sceglie: pianificare senza
 * vedere il numero è metà della funzione. Il calcolo è la stessa funzione
 * pura che gira sul server, quindi anteprima e saldo definitivo non possono
 * divergere.
 */

export interface MigrationServiceOption {
  _id: string;
  name: string;
  monthlyRate: number;
}

interface MigrationFormProps {
  subscriptionId: string;
  /** Servizi attivi diversi da quello attuale. */
  services: MigrationServiceOption[];
  periodicity: Periodicity;
  donationSupplement: number;
  oldMonthlyRate: number;
  /** ISO, o null se l'abbonamento non ha ancora una scadenza. */
  oldNextDueDate: string | null;
  oldPaidForCurrentCycle: number;
  onSuccess?: (message: string) => void;
}

export function MigrationForm({
  subscriptionId,
  services,
  periodicity,
  donationSupplement,
  oldMonthlyRate,
  oldNextDueDate,
  oldPaidForCurrentCycle,
  onSuccess,
}: MigrationFormProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toService, setToService] = useState(services[0]?._id ?? "");
  const [effectiveDate, setEffectiveDate] = useState(
    oldNextDueDate ? toDateInputValue(new Date(oldNextDueDate)) : toDateInputValue(new Date())
  );
  const [closeOld, setCloseOld] = useState<MigrationCloseOld>("alla_decorrenza");
  // Preselezionata su quella in corso: cambiarla e una scelta deliberata,
  // non il caso normale.
  const [toPeriodicity, setToPeriodicity] = useState<Periodicity>(periodicity);

  const target = services.find((service) => service._id === toService);
  const balance = target
    ? migrationBalance({
        // Stessa costruzione che usera il server sulla stringa inviata:
        // vedi effectiveDateFromInput.
        effectiveDate: effectiveDateFromInput(effectiveDate),
        closeOld,
        oldNextDueDate: oldNextDueDate ? new Date(oldNextDueDate) : null,
        oldMonthlyRate,
        oldPaidForCurrentCycle,
        newMonthlyRate: target.monthlyRate,
        newPeriodicity: toPeriodicity,
        donationSupplement,
      })
    : null;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!toService) {
      setError("Scegli il servizio di destinazione.");
      return;
    }
    setPending(true);
    setError(null);

    const result = await submitJson(
      `/api/subscriptions/${subscriptionId}/migration`,
      "POST",
      { toService, effectiveDate, closeOld, toPeriodicity },
      "Pianificazione non riuscita. Riprova."
    );

    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (onSuccess) onSuccess("Migrazione pianificata");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nuovo servizio">
          <Select
            name="toService"
            value={toService}
            onChange={(event) => setToService(event.target.value)}
          >
            {services.map((service) => (
              <option key={service._id} value={service._id}>
                {service.name} — {formatEUR(service.monthlyRate)}/mese
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Periodicita" hint="Del nuovo abbonamento">
          <Select
            name="toPeriodicity"
            value={toPeriodicity}
            onChange={(event) => setToPeriodicity(event.target.value as Periodicity)}
          >
            <option value="monthly">Mensile</option>
            <option value="quarterly">Trimestrale</option>
          </Select>
        </Field>

        <Field label="Decorrenza" hint="Quando parte il nuovo abbonamento">
          <TextInput
            type="date"
            name="effectiveDate"
            value={effectiveDate}
            onChange={(event) => setEffectiveDate(event.target.value)}
            required
          />
        </Field>

        <div className="sm:col-span-2">
          <Field label="Cosa succede all'abbonamento attuale">
            <Select
              name="closeOld"
              value={closeOld}
              onChange={(event) => setCloseOld(event.target.value as MigrationCloseOld)}
            >
              <option value="alla_decorrenza">
                Cessa alla decorrenza — i mesi pagati e non goduti fanno credito
              </option>
              <option value="a_scadenza">
                Resta attivo fino alla sua scadenza — nessun credito, i servizi si accavallano
              </option>
            </Select>
          </Field>
        </div>
      </div>

      {balance ? (
        <div className="rounded-[var(--radius)] border border-[var(--border)] px-4 py-3 text-sm">
          <table className="w-full">
            <tbody>
              {balance.cycleFullyCovered ? (
                <tr>
                  <td className="py-0.5 text-[var(--ink-muted)]">
                    Credito da spendere ({balance.creditMonths}{" "}
                    {balance.creditMonths === 1 ? "mese" : "mesi"})
                  </td>
                  <td className="py-0.5 text-right tnum">{formatEUR(balance.creditAmount)}</td>
                </tr>
              ) : null}
              {!balance.cycleFullyCovered && balance.convertedMonths > 0 ? (
                <tr>
                  <td className="py-0.5 text-[var(--ink-muted)]">
                    Mesi coperti dal credito ({balance.convertedMonths})
                  </td>
                  <td className="py-0.5 text-right tnum">{formatEUR(balance.convertedAmount)}</td>
                </tr>
              ) : null}
              {!balance.cycleFullyCovered ? (
                <tr>
                  <td className="py-0.5 text-[var(--ink-muted)]">
                    Mesi da aggiungere ({balance.remainingMonths})
                  </td>
                  <td className="py-0.5 text-right tnum">{formatEUR(balance.remainingAmount)}</td>
                </tr>
              ) : null}
              {balance.donationAmount > 0 ? (
                <tr>
                  <td className="py-0.5 text-[var(--ink-muted)]">Supplemento donazione</td>
                  <td className="py-0.5 text-right tnum">{formatEUR(balance.donationAmount)}</td>
                </tr>
              ) : null}
              <tr className="border-t border-[var(--border)]">
                <td className="pt-1.5 font-medium">Saldo da versare</td>
                <td className="pt-1.5 text-right font-medium tnum">
                  {formatEUR(balance.saldo)}
                </td>
              </tr>
            </tbody>
          </table>
          {balance.coveredCycles >= 1 ? (
            <p className="mt-2 text-xs text-[var(--ink-muted)]">
              Il credito copre {balance.coveredCycles}{" "}
              {balance.coveredCycles === 1 ? "ciclo intero" : "cicli interi"}: niente da
              versare alla decorrenza.
              {balance.creditRemainder > 0
                ? ` Restano ${formatEUR(balance.creditRemainder)} sul ciclo successivo.`
                : ""}
            </p>
          ) : null}
        </div>
      ) : null}

      {error ? <ErrorMessage>{error}</ErrorMessage> : null}

      <button type="submit" disabled={pending} className={buttonPrimary}>
        {pending ? "Pianificazione in corso" : "Pianifica migrazione"}
      </button>
    </form>
  );
}

export function PlanMigrationButton(props: Omit<MigrationFormProps, "onSuccess">) {
  const [open, setOpen] = useState(false);
  const showToast = useToast();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={buttonSecondary}
        disabled={props.services.length === 0}
        title={props.services.length === 0 ? "Non ci sono altri servizi attivi" : undefined}
      >
        Pianifica migrazione
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Pianifica migrazione">
        <MigrationForm
          {...props}
          onSuccess={(message) => {
            setOpen(false);
            showToast(message);
          }}
        />
      </Modal>
    </>
  );
}
