/**
 * Paginazione degli elenchi.
 *
 * Come l'ordinamento, vive nell'URL (`?per=50&page=2`): la pagina resta una
 * Server Component senza stato client e la vista è condivisibile.
 *
 * Affetta righe già lette e già ordinate, non traduce in `skip`/`limit` di
 * Mongo. Non è una scelta di comodità: gli elenchi si ordinano dopo la lettura
 * (`lib/sorting.ts`), perché alcune colonne — la persona, la scadenza, lo stato
 * — o stanno su un documento popolato o non esistono affatto nel database.
 * Paginare in Mongo riordinerebbe solo le righe della pagina corrente, dando
 * un risultato sbagliato senza segnalarlo.
 */

/** Le sole dimensioni offerte. Un `per` diverso nell'URL torna al primo valore. */
export const PAGE_SIZES = [50, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

export interface PaginationState {
  /** Righe per pagina. */
  per: PageSize;
  /** Pagina corrente, a partire da 1. */
  page: number;
}

/**
 * Legge `per` e `page` dalla query string correggendo i valori impossibili
 * invece di fallire: un `per` inventato torna a 50, una pagina oltre l'ultima
 * si ferma sull'ultima, così un link vecchio o modificato a mano mostra righe
 * invece di una tabella vuota.
 */
export function parsePagination(
  raw: { per?: string; page?: string },
  totalRows: number
): PaginationState {
  const requested = Number(raw.per);
  const per = (PAGE_SIZES as readonly number[]).includes(requested)
    ? (requested as PageSize)
    : PAGE_SIZES[0];

  const lastPage = Math.max(1, Math.ceil(totalRows / per));
  const requestedPage = Math.floor(Number(raw.page));
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  return { per, page: Math.min(page, lastPage) };
}

export interface Page<T> {
  rows: T[];
  /** Posizione della prima e dell'ultima riga mostrate, a partire da 1. */
  from: number;
  to: number;
  total: number;
  lastPage: number;
  hasPrevious: boolean;
  hasNext: boolean;
}

/** Affetta le righe della pagina corrente e descrive dove ci si trova. */
export function paginate<T>(rows: T[], { per, page }: PaginationState): Page<T> {
  const total = rows.length;
  const lastPage = Math.max(1, Math.ceil(total / per));
  const start = (page - 1) * per;
  const slice = rows.slice(start, start + per);

  return {
    rows: slice,
    // Con zero righe l'intervallo è 0–0: "da 1 a 0" non si legge.
    from: total === 0 ? 0 : start + 1,
    to: start + slice.length,
    total,
    lastPage,
    hasPrevious: page > 1,
    hasNext: page < lastPage,
  };
}

/**
 * Costruisce i link di paginazione conservando gli altri parametri, così
 * cambiare pagina non perde l'ordinamento o i filtri attivi.
 *
 * Cambiare dimensione riporta a pagina 1: la riga che stavi guardando a pagina
 * 3 da 50 non sta a pagina 3 da 100, quindi restare sul numero mostrerebbe
 * righe arbitrarie.
 */
export function pageHrefBuilder(
  basePath: string,
  params: Record<string, string | undefined>,
  current: PaginationState
) {
  function build(next: Partial<PaginationState>): string {
    const query = new URLSearchParams();
    for (const [name, value] of Object.entries(params)) {
      if (value && name !== "per" && name !== "page") query.set(name, value);
    }
    const per = next.per ?? current.per;
    const page = next.page ?? current.page;
    if (per !== PAGE_SIZES[0]) query.set("per", String(per));
    if (page > 1) query.set("page", String(page));
    const search = query.toString();
    return search ? `${basePath}?${search}` : basePath;
  }

  return {
    /** Pagina n, stessa dimensione. */
    toPage: (page: number) => build({ page }),
    /** Dimensione diversa, si riparte dalla prima pagina. */
    toSize: (per: PageSize) => build({ per, page: 1 }),
  };
}
