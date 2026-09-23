/**
 * Ricerca testuale degli elenchi.
 *
 * Una regola sola, condivisa dal picker dei pagamenti e dall'elenco
 * abbonamenti: chi scrive qualcosa nella ricerca si aspetta che si comporti
 * allo stesso modo nei due posti, e due copie della stessa funzione sarebbero
 * divergute alla prima modifica.
 *
 * Non è una ricerca full-text di Mongo: gli elenchi sono già interamente
 * caricati (stato, quota e scadenza sono calcolati a ogni lettura, quindi la
 * pagina li legge tutti comunque), e filtrarli nel browser è istantaneo mentre
 * una query per ogni tasto premuto non lo sarebbe.
 */

/** Minuscole e senza accenti: cercare "nicolo" deve trovare "Nicolò". */
export function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * Vero se ogni parola scritta compare in almeno uno dei campi.
 *
 * Le parole valgono tutte e possono venire da campi diversi: "anna claude"
 * trova l'abbonamento di Anna a Claude, e non chi si chiama "Anna" su un altro
 * servizio. È il comportamento che ci si aspetta scrivendo di getto due pezzi
 * di informazione che si ricordano.
 *
 * Una query vuota corrisponde a tutto: la ricerca non filtra finché non si
 * scrive davvero qualcosa.
 */
export function matchesQuery(
  fields: (string | null | undefined)[],
  query: string
): boolean {
  const needle = normalize(query.trim());
  if (!needle) return true;
  const haystack = normalize(fields.filter(Boolean).join(" "));
  return needle.split(/\s+/).every((word) => haystack.includes(word));
}
