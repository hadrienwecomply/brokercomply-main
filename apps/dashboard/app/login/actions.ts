"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_S,
  checkCredentials,
  safeNextPath,
  signSession,
} from "@/lib/auth";

export interface LoginState {
  error: string | null;
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const user = String(formData.get("user") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNextPath(String(formData.get("next") ?? ""));

  const matched = user && password ? checkCredentials(user, password) : null;
  if (!matched) {
    return { error: "Identifiant ou mot de passe incorrect." };
  }

  const token = await signSession(matched, Date.now());
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  });

  redirect(next);
}
