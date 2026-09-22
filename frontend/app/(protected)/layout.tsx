import { requireAdmin } from "@/lib/requireAdmin";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

/**
 * Controllo autorevole per tutte le pagine dell'app in un punto solo.
 * Il route group non cambia gli URL: le parentesi non sono un segmento di percorso.
 * Header e Footer stanno qui (non nel root layout) così la pagina /login,
 * che eredita solo app/layout.tsx, non li mostra a un utente non autenticato.
 */
export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">{children}</main>
      <Footer />
    </div>
  );
}
