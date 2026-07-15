import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, checkCredentials, loadCredentials, verifySession } from "@/lib/auth";

/**
 * Auth gate for the whole dashboard.
 *
 * The product was designed "private network, no auth in v1", but the Railway
 * deployment exposes it publicly on the internet (app.brokercomply.be), so
 * everything a browser can reach sits behind a per-person credential.
 *
 * Browser flow: a signed session cookie set by the branded /login page (no
 * more native Basic Auth popup). Unauthenticated page loads redirect to
 * /login?next=…; non-HTML requests (fetch/API) get a plain 401.
 *
 * Script flow: a valid `Authorization: Basic` header is still honoured on any
 * route, so curl/monitoring keep working without a cookie jar.
 *
 * Runs on the Edge runtime — everything it uses lives in src/lib/auth.ts and
 * is Web Crypto only. Enforcement stays OPT-IN: with no credential configured
 * (local `next dev`), the gate is disabled entirely.
 */

function parseBasicHeader(header: string | null): { user: string; password: string } | null {
  if (!header?.startsWith("Basic ")) return null;
  let decoded: string;
  try {
    decoded = atob(header.slice("Basic ".length));
  } catch {
    return null;
  }
  // Username can't contain ':'; password may — split on the first colon only.
  const sep = decoded.indexOf(":");
  if (sep === -1) return null;
  return { user: decoded.slice(0, sep), password: decoded.slice(sep + 1) };
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  // Opt-in: nothing configured → do not gate (keeps local dev frictionless).
  if (loadCredentials().length === 0) {
    return NextResponse.next();
  }

  const { pathname, search } = request.nextUrl;

  // The login page and its server action must stay reachable logged-out.
  if (pathname === "/login" || pathname.startsWith("/api/auth/")) {
    return NextResponse.next();
  }

  // 1. Session cookie (browser flow).
  const cookie = request.cookies.get(SESSION_COOKIE)?.value;
  if (cookie && (await verifySession(cookie, Date.now())) !== null) {
    return NextResponse.next();
  }

  // 2. Basic header (scripts / curl — no popup is ever triggered by us).
  const basic = parseBasicHeader(request.headers.get("authorization"));
  if (basic && checkCredentials(basic.user, basic.password) !== null) {
    return NextResponse.next();
  }

  // Unauthenticated: browsers navigating to a page go to /login, the rest 401.
  const wantsHtml =
    request.method === "GET" && (request.headers.get("accept") ?? "").includes("text/html");
  if (wantsHtml) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return new NextResponse("Authentication required", { status: 401 });
}

export const config = {
  /*
   * Gate everything EXCEPT:
   *  - api/webhooks  → inbound n8n & Fillout callbacks (own token-in-path + secret)
   *  - _next/static, _next/image → build assets / image optimizer
   *  - favicon.ico, icon.svg, robots.txt, sitemap.xml, brokercomply-logo.svg → public metadata
   * Every other path (the UI and all browser-called API routes) is protected.
   */
  matcher: [
    "/((?!api/webhooks|_next/static|_next/image|favicon.ico|icon.svg|robots.txt|sitemap.xml|brokercomply-logo.svg).*)",
  ],
};
