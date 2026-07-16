"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { authenticateUser, passwordFragment } from "@brokercomply/shared";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_S,
  isAuthEnabled,
  safeNextPath,
  signSession,
} from "@/lib/auth";
import { getDb } from "@/lib/db.server";
import { lockedForMinutes, recordLoginFailure, recordLoginSuccess } from "@/lib/login-throttle";

export interface LoginState {
  error: string | null;
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNextPath(String(formData.get("next") ?? ""));

  // Gate off (local dev without a secret) — nothing to sign, just pass through.
  if (!isAuthEnabled()) {
    redirect(next);
  }

  // Brute-force throttle, keyed on (client IP, email).
  const ip = ((await headers()).get("x-forwarded-for") ?? "local").split(",")[0]!.trim();
  const lockedMin = lockedForMinutes(ip, email.toLowerCase());
  if (lockedMin > 0) {
    return { error: `Trop de tentatives. Réessayez dans ${lockedMin} min.` };
  }

  const user =
    email && password ? await authenticateUser({ db: getDb() }, email, password) : null;
  if (!user) {
    recordLoginFailure(ip, email.toLowerCase());
    // One message for unknown email / wrong password / deactivated account.
    return { error: "Identifiant ou mot de passe incorrect." };
  }
  recordLoginSuccess(ip, email.toLowerCase());

  const token = await signSession(
    { email: user.email, phf: passwordFragment(user.passwordHash) },
    Date.now(),
  );
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  });

  redirect(next);
}
