import { LoginForm } from "@/components/LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  // Solo percorsi interni: "//evil.com" e "https://evil.com" vengono scartati.
  const target = from && from.startsWith("/") && !from.startsWith("//") ? from : "/";

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="font-[family-name:var(--font-manrope)] text-[28px] font-bold leading-tight">
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
