/**
 * Ordinamento degli elenchi.
 *
 * L'ordinamento vive nell'URL (`?sort=colonna&dir=asc`) come già i filtri degli
 * abbonamenti: la vista ordinata è condivisibile e sopravvive al refresh, e le
 * pagine restano Server Component senza stato client.
 *
 * Non è una `.sort()` di Mongo: quota, totale, scadenza e stato non esistono nel
 * database, sono calcolati a ogni lettura, quindi l'ordinamento si applica per
 * forza dopo il calcolo — esattamente come i filtri per stato.
 */

export type SortDirection = "asc" | "desc";

export interface SortState {
  key: string;
  dir: SortDirection;
}

/** Valore confrontabile estratto da una riga. `null` finisce sempre in fondo. */
export type SortValue = string | number | Date | null | undefined;

/**
 * Legge `sort`/`dir` dalla query string accettando solo le colonne dichiarate
 * dalla pagina: un parametro inventato a mano nell'URL torna all'ordinamento
 * predefinito invece di produrre una tabella vuota o un errore.
 */
export function parseSort(
  raw: { sort?: string; dir?: string },
  allowedKeys: readonly string[],
  fallback: SortState
): SortState {
  const key = raw.sort && allowedKeys.includes(raw.sort) ? raw.sort : fallback.key;
  const dir: SortDirection = raw.dir === "asc" || raw.dir === "desc" ? raw.dir : fallback.dir;
  return { key, dir };
}

function compare(a: SortValue, b: SortValue): number {
  const aEmpty = a === null || a === undefined || a === "";
  const bEmpty = b === null || b === undefined || b === "";
  // I vuoti restano in fondo in entrambe le direzioni: una riga senza scadenza
  // non è "la più recente", è semplicemente priva del dato.
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;

  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === "number" && typeof b === "number") return a - b;
  // localeCompare italiano: altrimenti le maiuscole e le lettere accentate
  // finirebbero fuori posto rispetto all'ordine alfabetico atteso.
  return String(a).localeCompare(String(b), "it", { sensitivity: "base", numeric: true });
}

/**
 * Ordina una copia delle righe. `Array.prototype.sort` è stabile, quindi a
 * parità di valore l'ordine di partenza (il più recente, di norma) è conservato.
 */
export function sortRows<T>(
  rows: T[],
  getValue: (row: T) => SortValue,
  dir: SortDirection
): T[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const result = compare(getValue(a), getValue(b));
    // I vuoti restano in fondo anche in discendente: non vanno invertiti.
    if (result === 1 || result === -1) {
      const aEmpty = isEmpty(getValue(a));
      const bEmpty = isEmpty(getValue(b));
      if (aEmpty !== bEmpty) return result;
    }
    return result * sign;
  });
}

function isEmpty(value: SortValue): boolean {
  return value === null || value === undefined || value === "";
}

/**
 * Costruisce il link di una intestazione: primo clic crescente, clic successivo
 * sulla stessa colonna inverte. Conserva gli altri parametri (i filtri).
 */
export function sortHrefBuilder(
  basePath: string,
  params: Record<string, string | undefined>,
  current: SortState
): (key: string) => string {
  return (key: string) => {
    const query = new URLSearchParams();
    for (const [name, value] of Object.entries(params)) {
      if (value && name !== "sort" && name !== "dir") query.set(name, value);
    }
    query.set("sort", key);
    query.set("dir", current.key === key && current.dir === "asc" ? "desc" : "asc");
    return `${basePath}?${query.toString()}`;
  };
}
