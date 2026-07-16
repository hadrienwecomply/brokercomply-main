import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

/**
 * Clears the session cookie and sends the user back to the login page.
 *
 * The Location header is RELATIVE on purpose: behind the Railway proxy,
 * `request.url` resolves to the container's internal origin (localhost:8080),
 * so an absolute redirect built from it points nowhere. RFC 7231 allows
 * relative references and every browser resolves them against the current
 * origin.
 */
export async function POST() {
  const response = new NextResponse(null, {
    status: 303,
    headers: { Location: "/login" },
  });
  response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
