"use client";

import { useId, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { inputClass } from "@/components/form";
import { buttonSecondary } from "@/components/ui";
import { formatEUR } from "@/lib/billing";
import { matchesQuery } from "@/lib/search";
import type { PaymentSubscriptionOption } from "@/components/RegisterPaymentForm";

/**
 * Scelta dell'abbonamento a cui imputare un pagamento.
 *
 * Non è un `<select>`: l'elenco cresce con le persone del team e scorrere
 * decine di voci per trovarne una è impraticabile. Qui si scrive un pezzo di
 * nome, email o servizio e la lista si restringe; una volta scelto
 * l'abbonamento la lista si chiude e resta la riga selezionata.
 *
 * La lista è in linea e non sovrapposta: dentro una modale un secondo livello
 * fluttuante sarebbe più fragile, e le guidelines riservano le ombre agli
 * elementi sovrapposti.
 */


export function SubscriptionPicker({
  options,
  value,
  onChange,
}: {
  options: PaymentSubscriptionOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [open, setOpen] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const selected = options.find((option) => option._id === value) ?? null;

  const matches = useMemo(
    () =>
      options.filter((option) =>
        matchesQuery([option.personName, option.email, option.serviceName], query)
      ),
    [options, query]
  );

  function choose(option: PaymentSubscriptionOption) {
    onChange(option._id);
    setOpen(false);
    setQuery("");
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (matches.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setHighlight((current) => (current + step + matches.length) % matches.length);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const option = matches[highlight];
      if (option) choose(option);
      return;
    }
    if (event.key === "Escape" && selected) {
      event.preventDefault();
      setOpen(false);
    }
  }

  if (selected && !open) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius)] border border-[var(--border)] px-3 py-2">
        <OptionSummary option={selected} />
        <button
          type="button"
          className={`${buttonSecondary} px-2.5 py-1 text-xs`}
          onClick={() => {
            setOpen(true);
            setQuery("");
            setHighlight(0);
            // Il focus torna alla ricerca: chi ha cliccato "Cambia" vuole scrivere.
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
        >
          Cambia
        </button>
      </div>
    );
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded="true"
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        className={inputClass}
        placeholder="Cerca per nome, email o servizio"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setHighlight(0);
        }}
        onKeyDown={handleKeyDown}
      />

      {matches.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--ink-muted)]">
          Nessun abbonamento corrisponde a «{query}».
        </p>
      ) : (
        <ul
          id={listId}
          role="listbox"
          className="mt-2 max-h-56 overflow-y-auto rounded-[var(--radius)] border border-[var(--border)]"
        >
          {matches.map((option, index) => (
            <li key={option._id}>
              <button
                type="button"
                role="option"
                aria-selected={option._id === value}
                onClick={() => choose(option)}
                onMouseEnter={() => setHighlight(index)}
                className={`flex w-full items-center justify-between gap-3 border-b border-[var(--border)] px-3 py-2 text-left last:border-0 ${
                  index === highlight ? "bg-[var(--surface)]" : ""
                }`}
              >
                <OptionSummary option={option} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-1 text-xs text-[var(--ink-muted)]">
        {matches.length} di {options.length} abbonamenti
      </p>
    </div>
  );
}

/** Riga di riepilogo: persona, email, servizio e quanto resta da incassare. */
function OptionSummary({ option }: { option: PaymentSubscriptionOption }) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <span
        aria-hidden
        className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--surface)] font-[family-name:var(--font-manrope)] text-xs font-semibold text-[var(--ink-muted)]"
      >
        {option.serviceLogo ? (
          <Image
            src={option.serviceLogo}
            alt=""
            width={24}
            height={24}
            className="h-full w-full object-contain"
          />
        ) : (
          option.serviceName.slice(0, 1).toUpperCase()
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{option.personName}</span>
        <span className="block truncate text-xs text-[var(--ink-muted)]">
          {option.email} · {option.serviceName}
        </span>
      </span>
      <span className="tnum shrink-0 text-xs text-[var(--ink-muted)]">
        {option.outstanding > 0
          ? `residuo ${formatEUR(option.outstanding)}`
          : formatEUR(option.totalDue)}
      </span>
    </span>
  );
}
