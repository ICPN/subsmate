/** Footer minimale in Ink Navy (§5). */
export function Footer() {
  return (
    <footer className="mt-16 bg-[var(--ink-navy)] text-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-6 py-6">
        <p className="text-xs text-white/60">
          SubsMate — gestione abbonamenti team ICPN
        </p>
        <p className="text-xs text-white/60">
          Gli importi mostrati sono calcolati dai pagamenti registrati.
        </p>
      </div>
    </footer>
  );
}
