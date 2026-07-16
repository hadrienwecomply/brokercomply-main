import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, isAuthEnabled, verifySession } from "@/lib/auth";

/**
 * Auth gate for the whole dashboard.
 *
 * The product was designed "private network, no auth in v1", but the Railway
 * deployment exposes it publicly on the internet (app.brokercomply.be), so
 * everything a browser can reach sits behind a per-person account (the `users`
 * table — the old env-based Basic Auth credentials are gone).
 *
 * Flow: a signed session cookie set by the branded /login page. Unauthenticated
 * page loads redirect to /login?next=…; non-HTML requests (fetch/API) get a
 * plain 401.
 *
 * Runs on the Edge runtime — the cookie's HMAC and expiry are checked locally
 * (src/lib/auth.ts, Web Crypto only); DB-side staleness (password changed,
 * account deactivated) is delegated to the internal /api/auth/validate route
 * (Node), with a short cache and a fail-open on infra errors.
 * Enforcement stays OPT-IN: with no `DASHBOARD_SESSION_SECRET` configured
 * (local `next dev`), the gate is disabled entirely.
 */

export async function middleware(request: NextRequest): Promise<NextResponse> {
  // Opt-in: no secret configured → do not gate (keeps local dev frictionless).
  if (!isAuthEnabled()) {
    return NextResponse.next();
  }

  const { pathname, search } = request.nextUrl;

  // The login page and its server action must stay reachable logged-out.
  if (pathname === "/login" || pathname.startsWith("/api/auth/")) {
    return NextResponse.next();
  }

  // Session cookie: HMAC signature + expiry (edge-safe, no DB), then a
  // DB-side staleness check (deactivated / password changed) through the
  // internal Node route — so revocation applies to API calls and server
  // actions too, not just page renders. 401 = definitively stale; any other
  // outcome (204, 5xx, network error) fails open: the HMAC already proves a
  // real login, and a transient DB blip must not lock the whole app.
  const cookie = request.cookies.get(SESSION_COOKIE)?.value;
  if (cookie && (await verifySession(cookie, Date.now())) !== null) {
    let stale = false;
    try {
      const res = await fetch(new URL("/api/auth/validate", request.url), {
        headers: { cookie: request.headers.get("cookie") ?? "" },
      });
      stale = res.status === 401;
    } catch {
      // fail open
    }
    if (!stale) {
      return NextResponse.next();
    }
    // Fall through to the unauthenticated branch (redirect or 401) below.
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
