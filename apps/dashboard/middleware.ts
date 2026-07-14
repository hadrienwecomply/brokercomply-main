import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * HTTP Basic Auth gate for the whole dashboard.
 *
 * The product was designed "private network, no auth in v1", but the Railway
 * deployment exposes it publicly on the internet (app.brokercomply.be). This
 * middleware puts a per-person credential in front of everything a browser can
 * reach, so only the internal users get in.
 *
 * Runs on the Edge runtime, so it must stay free of Node-only APIs (no
 * `node:crypto`, no `Buffer`): we read env via `process.env`, decode the header
 * with `atob`, and compare in constant time with a hand-rolled helper.
 *
 * Enforcement is OPT-IN: it only kicks in when at least one credential is
 * configured. Local `next dev` without any credential stays open; production
 * sets `DASHBOARD_BASIC_AUTH_USERS` on the Railway service. See config.matcher
 * below for the paths deliberately left public (inbound webhooks, which carry
 * their own token + secret).
 *
 * Credential sources (both honoured, merged):
 *   - DASHBOARD_BASIC_AUTH_USERS: one credential per person, as `user:password`
 *     pairs separated by a comma or newline, e.g. "alice:pw1,bob:pw2".
 *     Passwords must not contain ',' or ':' (generated ones use a safe alphabet).
 *   - DASHBOARD_BASIC_AUTH_USER / DASHBOARD_BASIC_AUTH_PASSWORD: a single
 *     legacy pair (kept for convenience / backward compatibility).
 */

const REALM = "BrokerComply";

interface Credential {
  user: string;
  password: string;
}

/** Parse the configured credentials from env. Empty array → auth disabled. */
function loadCredentials(): Credential[] {
  const creds: Credential[] = [];

  const list = process.env.DASHBOARD_BASIC_AUTH_USERS;
  if (list) {
    for (const raw of list.split(/[,\n]/)) {
      const pair = raw.trim();
      if (!pair) continue;
      const sep = pair.indexOf(":");
      if (sep <= 0) continue; // need a non-empty username before ':'
      creds.push({ user: pair.slice(0, sep), password: pair.slice(sep + 1) });
    }
  }

  const singleUser = process.env.DASHBOARD_BASIC_AUTH_USER;
  const singlePassword = process.env.DASHBOARD_BASIC_AUTH_PASSWORD;
  if (singleUser && singlePassword) {
    creds.push({ user: singleUser, password: singlePassword });
  }

  return creds;
}

/**
 * Constant-time string comparison. Avoids leaking how many leading characters
 * matched via timing. The length XOR folds a length mismatch into the diff so
 * the loop bound (driven by `a`, the attacker-controlled input) can't be used
 * to distinguish a wrong-length guess from a wrong-value one.
 */
function safeEqual(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < ab.length; i++) {
    diff |= ab[i] ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

function unauthorized(): NextResponse {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": `Basic realm="${REALM}", charset="UTF-8"`,
    },
  });
}

export function middleware(request: NextRequest): NextResponse {
  const credentials = loadCredentials();

  // Opt-in: nothing configured → do not gate (keeps local dev frictionless).
  if (credentials.length === 0) {
    return NextResponse.next();
  }

  const header = request.headers.get("authorization");
  if (!header?.startsWith("Basic ")) {
    return unauthorized();
  }

  let decoded: string;
  try {
    decoded = atob(header.slice("Basic ".length));
  } catch {
    return unauthorized();
  }

  // Username can't contain ':'; password may — split on the first colon only.
  const sep = decoded.indexOf(":");
  if (sep === -1) {
    return unauthorized();
  }
  const user = decoded.slice(0, sep);
  const password = decoded.slice(sep + 1);

  // Check against every configured credential without early-exit, so a wrong
  // username and a wrong password take the same path (no user enumeration).
  let matched = false;
  for (const cred of credentials) {
    const ok = safeEqual(user, cred.user) && safeEqual(password, cred.password);
    matched = matched || ok;
  }
  if (!matched) {
    return unauthorized();
  }

  return NextResponse.next();
}

export const config = {
  /*
   * Gate everything EXCEPT:
   *  - api/webhooks  → inbound n8n & Fillout callbacks (own token-in-path + secret)
   *  - _next/static, _next/image → build assets / image optimizer
   *  - favicon.ico, robots.txt, sitemap.xml → public metadata
   * Every other path (the UI and all browser-called API routes) is protected.
   */
  matcher: [
    "/((?!api/webhooks|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
