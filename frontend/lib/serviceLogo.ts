import fs from "node:fs";
import path from "node:path";

/**
 * Logo di un servizio, risolto per convenzione: `public/logo/<slug>.<ext>`.
 *
 * Nessuna mappa slug → file nel codice: aggiungere un servizio LLM resta un
 * documento in più (requisito di PROJECT.md), con al massimo un'immagine da
 * depositare nella cartella. Un servizio senza immagine non è un errore:
 * `ServiceMark` ricade sull'iniziale in un cerchio.
 *
 * Solo lato server (usa `fs`): si importa da `lib/queries.ts`, mai da un
 * componente client, altrimenti finirebbe nel bundle del browser.
 */

const LOGO_DIR = path.join(process.cwd(), "public", "logo");
const EXTENSIONS = [".svg", ".png", ".webp", ".jpg", ".jpeg"];

/**
 * La cartella si legge una volta sola per processo. I loghi cambiano quando si
 * fa il deploy, non fra una richiesta e l'altra, e le pagine sono
 * force-dynamic: rileggerla a ogni riga di tabella sarebbe uno spreco.
 */
let cache: Map<string, string> | null = null;

function logoIndex(): Map<string, string> {
  if (cache) return cache;
  const index = new Map<string, string>();
  try {
    for (const file of fs.readdirSync(LOGO_DIR)) {
      const ext = path.extname(file).toLowerCase();
      if (!EXTENSIONS.includes(ext)) continue;
      index.set(path.basename(file, ext).toLowerCase(), `/logo/${file}`);
    }
  } catch {
    // Cartella assente: nessun logo, si usano le iniziali.
  }
  cache = index;
  return index;
}

export function serviceLogoFor(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return logoIndex().get(slug.toLowerCase()) ?? null;
}
