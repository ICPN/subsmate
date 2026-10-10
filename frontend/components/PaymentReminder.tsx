"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { buttonPrimary, buttonSecondary } from "@/components/ui";
import { Field, inputClass } from "@/components/form";
import type { PaymentSubscriptionOption } from "@/components/RegisterPaymentForm";
import {
  DUE_SOON_DAYS,
  daysBetween,
  formatDate,
  formatEUR,
  paymentReminder,
  statusDetail,
  type Reminder,
} from "@/lib/billing";

/**
 * Calcolatore del sollecito: quanto deve la persona su tutti i suoi
 * abbonamenti e un messaggio pronto da copiare. Il riquadro mostra all'admin
 * ogni passaggio del calcolo; il messaggio solo il saldo per servizio, il
 * credito scalato e il totale.
 *
 * Popover nativo: sta nel top layer, quindi sopra anche al modale dei
 * Pagamenti, senza z-index né portal.
 */

const PERIODICITY_LABELS: Record<string, string> = {
  monthly: "Mensile",
  quarterly: "Trimestrale",
};

function reminderMessage(firstName: string, reminder: Reminder): string {
  return [
    `Ciao${firstName ? ` ${firstName}` : ""}, ecco il riepilogo delle quote per gli abbonamenti condivisi:`,
    "",
    ...reminder.lines.map((line) => `- ${line.serviceName}: ${formatEUR(line.amount)}`),
    "",
    ...(reminder.creditUsed > 0
      ? [`Credito primo mese già scalato: ${formatEUR(reminder.creditUsed)}`]
      : []),
    `Totale da versare: ${formatEUR(reminder.total)}`,
    "",
    "Grazie!",
  ].join("\n");
}

/** «In ritardo di 8 giorni», «Scade fra 3 giorni», «Scade oggi». */
function dueDetail(date: Date, now: Date): string {
  const days = daysBetween(now, date);
  return statusDetail(days < 0 ? "in_ritardo" : "in_scadenza", days);
}

export function PaymentReminder({ options }: { options: PaymentSubscriptionOption[] }) {
  const id = useId();
  const popoverRef = useRef<HTMLDivElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const [state, setState] = useState<{ reminder: Reminder; now: Date } | null>(null);
  const [message, setMessage] = useState("");
  const [copy, setCopy] = useState<"idle" | "done" | "failed">("idle");
  const firstName = options[0]?.firstName ?? "";
  // Il credito è della persona: è lo stesso su ogni suo abbonamento.
  const creditAvailable = options[0]?.firstCycleCredit ?? 0;

  function open() {
    // Calcolato all'apertura e non al render: "oggi" è quello del momento, e
    // il messaggio riparte dai dati anche se l'admin l'aveva ritoccato.
    const now = new Date();
    const reminder = paymentReminder(options, creditAvailable, now);
    setState({ reminder, now });
    setMessage(reminderMessage(firstName, reminder));
    setCopy("idle");
    popoverRef.current?.showPopover();
    // Il focus dentro al popover fa arrivare qui l'Esc, vedi onKeyDown.
    popoverRef.current?.focus();
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopy("done");
    } catch {
      messageRef.current?.select();
      setCopy("failed");
    }
  }

  const reminder = state?.reminder;
  const now = state?.now ?? new Date();
  const owed = reminder ? reminder.total + reminder.creditUsed : 0;
  // Gli abbonamenti senza nulla da chiedere si mostrano lo stesso, con la loro
  // scadenza: si capisce perché non compaiono nel conto.
  const settled = reminder
    ? options.filter(
        (option) => !reminder.lines.some((line) => line.serviceName === option.serviceName)
      )
    : [];

  return (
    <>
      <button type="button" onClick={open} className={buttonSecondary}>
        Vedi calcolo
      </button>

      <div
        ref={popoverRef}
        id={id}
        popover="auto"
        tabIndex={-1}
        role="dialog"
        aria-labelledby={`${id}-title`}
        // Esc chiude il popover da sé; senza fermarlo arriverebbe anche al
        // listener del Modal, che chiuderebbe il modulo perdendo i dati.
        onKeyDown={(event) => {
          if (event.key === "Escape") event.nativeEvent.stopImmediatePropagation();
        }}
        className="m-auto max-h-[90dvh] w-[min(36rem,calc(100vw-2rem))] overflow-y-auto rounded-[var(--radius)] border border-[var(--border)] bg-[var(--paper)] p-0 text-[var(--ink-navy)] shadow-lg outline-none"
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <h2
            id={`${id}-title`}
            className="font-[family-name:var(--font-manrope)] text-[18px] font-semibold"
          >
            Sollecito di pagamento
          </h2>
          <button
            type="button"
            popoverTarget={id}
            popoverTargetAction="hide"
            aria-label="Chiudi"
            className="rounded-[var(--radius)] px-2 py-1 text-[var(--ink-muted)] hover:bg-[var(--surface)]"
          >
            ×
          </button>
        </div>

        {reminder ? (
          <div className="space-y-4 px-4 py-4 text-sm">
            <p className="text-xs text-[var(--ink-muted)]">
              Calcolo al {formatDate(now)}: conta ogni ciclo con la scadenza già passata o
              entro {DUE_SOON_DAYS} giorni, meno quanto
              già versato sul ciclo aperto.
            </p>

            {reminder.lines.map((line) => (
              <section
                key={line.serviceName}
                className="rounded-[var(--radius)] border border-[var(--border)]"
              >
                <h3 className="border-b border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-medium">
                  {line.serviceName}
                  <span className="font-normal text-[var(--ink-muted)]">
                    {" "}
                    · {PERIODICITY_LABELS[line.periodicity] ?? line.periodicity}
                  </span>
                </h3>
                <dl className="space-y-1 px-3 py-2">
                  <Row label="Quota servizio per ciclo">
                    {formatEUR(line.totalDue - line.donationSupplement)}
                  </Row>
                  <Row label="Donazione per ciclo">{formatEUR(line.donationSupplement)}</Row>
                  <Row label="Totale per ciclo">{formatEUR(line.totalDue)}</Row>
                  <Row label="Cicli da pagare">{line.cycles}</Row>
                  {line.dueDates.length === 0 ? (
                    <p className="pl-3 text-xs text-[var(--ink-muted)]">
                      Primo pagamento: l’abbonamento è da attivare e non ha ancora una scadenza.
                    </p>
                  ) : (
                    <ul className="tnum space-y-0.5 pl-3 text-xs text-[var(--ink-muted)]">
                      {line.dueDates.map((date) => (
                        <li key={date.toISOString()}>
                          Scadenza {formatDate(date)}: {dueDetail(date, now)}
                        </li>
                      ))}
                    </ul>
                  )}
                  <Row label={`${line.cycles} × ${formatEUR(line.totalDue)}`}>
                    {formatEUR(line.cycles * line.totalDue)}
                  </Row>
                  {line.paid > 0 ? (
                    <Row label="Già versato sul ciclo aperto">-{formatEUR(line.paid)}</Row>
                  ) : null}
                  <Row label="Da versare" strong>
                    {formatEUR(line.amount)}
                  </Row>
                  {line.donation > 0 ? (
                    <Row label="di cui donazione" muted>
                      {formatEUR(line.donation)}
                    </Row>
                  ) : null}
                </dl>
              </section>
            ))}

            {settled.length > 0 ? (
              <ul className="space-y-1 text-xs text-[var(--ink-muted)]">
                {settled.map((option) => (
                  <li key={option._id}>
                    {option.serviceName}: nulla da versare,{" "}
                    {option.nextDueDate
                      ? `prossima scadenza ${formatDate(option.nextDueDate)} (${dueDetail(new Date(option.nextDueDate), now).toLowerCase()})`
                      : "nessuna scadenza"}
                    .
                  </li>
                ))}
              </ul>
            ) : null}

            {reminder.lines.length === 0 ? (
              <p className="text-[var(--ink-muted)]">
                Nessuna quota da sollecitare: nessuna scadenza passata o entro i prossimi giorni.
              </p>
            ) : (
              <>
                <dl className="space-y-1 rounded-[var(--radius)] border border-[var(--border)] px-3 py-2">
                  {reminder.lines.map((line) => (
                    <Row key={line.serviceName} label={line.serviceName}>
                      {formatEUR(line.amount)}
                    </Row>
                  ))}
                  <Row label="Somma">{formatEUR(owed)}</Row>
                  {creditAvailable > 0 ? (
                    <>
                      <Row label="Credito primo mese disponibile" muted>
                        {formatEUR(creditAvailable)}
                      </Row>
                      <Row label="Credito primo mese scalato">
                        -{formatEUR(reminder.creditUsed)}
                      </Row>
                      {creditAvailable > reminder.creditUsed ? (
                        <Row label="Credito che resta per la prossima volta" muted>
                          {formatEUR(creditAvailable - reminder.creditUsed)}
                        </Row>
                      ) : null}
                    </>
                  ) : null}
                  <div className="border-t border-[var(--border)] pt-1">
                    <Row label="Totale da versare" strong>
                      {formatEUR(reminder.total)}
                    </Row>
                  </div>
                  {reminder.donation > 0 ? (
                    <Row label="di cui donazione" muted>
                      {formatEUR(reminder.donation)}
                    </Row>
                  ) : null}
                </dl>

                {reminder.lines.some((line) => line.cycles > 1) ? (
                  <p className="text-xs text-[var(--ink-muted)]">
                    Per più cicli sullo stesso servizio registra un pagamento per ciascuno, con
                    la data della sua scadenza: un pagamento unico chiude un ciclo solo.
                  </p>
                ) : null}

                <Field label="Messaggio">
                  <textarea
                    ref={messageRef}
                    className={inputClass}
                    rows={8}
                    value={message}
                    onChange={(event) => {
                      setMessage(event.target.value);
                      setCopy("idle");
                    }}
                  />
                </Field>

                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" onClick={handleCopy} className={buttonPrimary}>
                    Copia messaggio
                  </button>
                  {copy === "done" ? (
                    <span className="text-[var(--ink-muted)]">Messaggio copiato</span>
                  ) : null}
                  {copy === "failed" ? (
                    <span className="text-[var(--ink-muted)]">
                      Copia non riuscita: il testo è selezionato, copialo con Ctrl+C.
                    </span>
                  ) : null}
                </div>
              </>
            )}
          </div>
        ) : null}
      </div>
    </>
  );
}

function Row({
  label,
  strong = false,
  muted = false,
  children,
}: {
  label: string;
  strong?: boolean;
  muted?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-3 ${muted ? "text-xs text-[var(--ink-muted)]" : ""}`}
    >
      <dt className={strong ? "font-semibold" : ""}>{label}</dt>
      <dd
        className={`tnum text-right ${strong ? "font-[family-name:var(--font-manrope)] font-bold" : ""}`}
      >
        {children}
      </dd>
    </div>
  );
}
