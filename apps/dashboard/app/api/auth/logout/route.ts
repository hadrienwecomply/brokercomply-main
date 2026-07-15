import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

/** Clears the session cookie and sends the user back to the login page. */
export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL("/login", request.url), 303);
  response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
