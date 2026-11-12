import { LoginForm } from "@/components/LoginForm";
import Image from "next/image";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  // Validazione positiva: accetta solo un percorso interno che inizia con "/"
  // e non prosegue con "/" o "\". I browser trattano "\" come "/" negli schemi
  // speciali, quindi "/\evil.com" sarebbe un redirect fuori dominio.
  const target = from && /^\/(?![/\\])/.test(from) ? from : "/";

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="flex items-center gap-3 font-[family-name:var(--font-manrope)] text-[28px] font-bold leading-tight">
          <Image src="/subsmate.svg" alt="" width={40} height={40} />
          SubsMate
        </h1>
        <p className="mb-6 mt-1 text-sm text-[var(--ink-muted)]">
          Accesso riservato agli amministratori.
        </p>
        <LoginForm from={target} />
      </div>
    </div>
  );
}
