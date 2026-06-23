import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js';
import { formatGraphError } from './errors.js';
import type { GraphTransport } from './types.js';

export interface GraphTransportConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  /** Max retries on throttling/transient errors (429/503/504). */
  maxRetries?: number;
  /**
   * Verbose request/error logging. Defaults to the SHAREPOINT_DEBUG env flag
   * ('1' or 'true'). Errors are ALWAYS logged with full detail regardless.
   */
  debug?: boolean;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function isRetryable(status?: number): boolean {
  return status === 429 || status === 503 || status === 504;
}

function debugEnabled(explicit?: boolean): boolean {
  if (explicit !== undefined) return explicit;
  const flag = process.env.SHAREPOINT_DEBUG;
  return flag === '1' || flag === 'true';
}

/**
 * Production {@link GraphTransport} backed by the Graph SDK with app-only auth
 * (`Sites.Selected` + per-site write grant) and exponential backoff + jitter on
 * throttling — mirroring the email ingestion client's retry policy.
 *
 * Absolute URLs (delta/next links, returned by Graph) are passed straight to
 * `client.api()`, which accepts them as-is.
 */
export function createGraphTransport(config: GraphTransportConfig): GraphTransport {
  const credential = new ClientSecretCredential(
    config.tenantId,
    config.clientId,
    config.clientSecret,
  );
  const authProvider = new TokenCredentialAuthenticationProvider(credential, {
    scopes: ['https://graph.microsoft.com/.default'],
  });
  const client = Client.initWithMiddleware({ authProvider });
  const maxRetries = config.maxRetries ?? 5;
  const debug = debugEnabled(config.debug);
  const log = (...args: unknown[]) => {
    if (debug) console.info('[sharepoint:graph]', ...args);
  };

  async function withRetry<T>(run: () => Promise<T>): Promise<T> {
    let attempt = 0;
    for (;;) {
      try {
        return await run();
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (!isRetryable(status) || attempt >= maxRetries) throw error;
        const retryAfter = Number(
          (error as { headers?: { get?: (k: string) => string } })?.headers?.get?.('retry-after'),
        );
        const backoff =
          Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 500;
        const jitter = Math.floor(backoff * 0.25 * Math.random());
        log(`retry ${attempt + 1}/${maxRetries} after ${status} in ${backoff + jitter}ms`);
        await sleep(backoff + jitter);
        attempt += 1;
      }
    }
  }

  /** Run one request with retry, logging the call (debug) and any error (always). */
  async function run<T>(method: string, url: string, exec: () => Promise<T>): Promise<T> {
    log(`→ ${method} ${url}`);
    try {
      const res = await withRetry(exec);
      log(`✓ ${method} ${url}`);
      return res;
    } catch (error) {
      console.error(`[sharepoint:graph] ✗ ${method} ${url} — ${formatGraphError(error)}`);
      throw error;
    }
  }

  return {
    get: <T>(url: string) => run('GET', url, () => client.api(url).get() as Promise<T>),
    post: <T>(url: string, body: unknown) =>
      run('POST', url, () => client.api(url).post(body) as Promise<T>),
    put: <T>(url: string, body: Buffer, contentType: string) =>
      run(
        'PUT',
        url,
        () => client.api(url).headers({ 'Content-Type': contentType }).put(body) as Promise<T>,
      ),
  };
}
