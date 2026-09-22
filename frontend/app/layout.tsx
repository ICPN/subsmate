import type { Metadata } from "next";
import { Manrope, Inter } from "next/font/google";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import "./globals.css";

// Due famiglie con ruoli distinti: Manrope per titoli e numeri chiave,
// Inter per testo e dati tabellari (brand-guidelines.md §4).
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["600", "700"],
});
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "SubsMate — Gestione abbonamenti team",
  description:
    "Gestione degli abbonamenti condivisi ai servizi LLM: quote, scadenze, stato pagamenti e storico.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body className={`${manrope.variable} ${inter.variable} flex min-h-screen flex-col antialiased`}>
        <Header />
        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
