"use client";

import { useActionState } from "react";
import { LogIn } from "lucide-react";
import { login, type LoginState } from "./actions";

const INITIAL: LoginState = { error: null };

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(login, INITIAL);

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="next" value={next} />

      <div className="space-y-1.5">
        <label htmlFor="login-email" className="block text-sm font-medium text-ink">
          Email
        </label>
        <input
          id="login-email"
          name="email"
          type="email"
          autoComplete="username"
          autoFocus
          required
          className="w-full rounded-md border border-line bg-white px-3.5 py-2.5 text-[15px] text-ink shadow-sm outline-none transition-colors placeholder:text-st-na/60 focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
          placeholder="prenom@we-comply.be"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="login-password" className="block text-sm font-medium text-ink">
          Mot de passe
        </label>
        <input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="w-full rounded-md border border-line bg-white px-3.5 py-2.5 text-[15px] text-ink shadow-sm outline-none transition-colors placeholder:text-st-na/60 focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
          placeholder="••••••••••••"
        />
      </div>

      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-st-blocked/25 bg-st-blocked/8 px-3.5 py-2.5 text-sm font-medium text-st-blocked"
        >
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-brand-600 px-4 py-2.5 text-[15px] font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <LogIn className="size-4" aria-hidden />
        {pending ? "Connexion…" : "Se connecter"}
      </button>
    </form>
  );
}
