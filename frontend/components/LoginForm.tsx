"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { buttonPrimary } from "@/components/ui";

export function LoginForm({ from }: { from: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: String(form.get("email")),
        password: String(form.get("password")),
      }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error ?? "Accesso non riuscito");
      setPending(false);
      return;
    }

    router.replace(from);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">Email</span>
        <input
          type="email"
          name="email"
          required
          autoComplete="username"
          autoFocus
          className="w-full rounded-[var(--radius)] border border-[var(--border)] px-3 py-2 text-sm"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">Password</span>
        <input
          type="password"
          name="password"
          required
          autoComplete="current-password"
          className="w-full rounded-[var(--radius)] border border-[var(--border)] px-3 py-2 text-sm"
        />
      </label>

      {error ? (
        <p
          role="alert"
          className="rounded-[var(--radius)] px-3 py-2 text-sm"
          style={{
            color: "var(--status-critical)",
            backgroundColor: "color-mix(in srgb, var(--status-critical) 12%, transparent)",
          }}
        >
          {error}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className={`${buttonPrimary} w-full`}>
        {pending ? "Accesso in corso" : "Accedi"}
      </button>
    </form>
  );
}
