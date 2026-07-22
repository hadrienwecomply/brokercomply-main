import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js';

export interface CalendarClientConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  /** Max retries on throttling/transient errors. */
  maxRetries?: number;
}

/** One calendar event, flattened to what the prospect sync needs. */
export interface CalendarEvent {
  /** Graph event id — the idempotence key for a booked-demo signal. */
  id: string;
  subject: string;
  /** Event start (UTC). */
  start: Date;
  /** Lowercased attendee + organizer addresses. */
  attendees: string[];
}

interface GraphEvent {
  id: string;
  subject?: string;
  start?: { dateTime?: string; timeZone?: string };
  isCancelled?: boolean;
  organizer?: { emailAddress?: { address?: string } };
  attendees?: Array<{ emailAddress?: { address?: string } }>;
}

interface EventsPage {
  value: GraphEvent[];
  '@odata.nextLink'?: string;
}

const EVENT_SELECT = ['id', 'subject', 'start', 'isCancelled', 'organizer', 'attendees'].join(',');
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * App-only Microsoft Graph calendar reader (`Calendars.Read` via the shared
 * `.default` application permissions). Lists the events of a given mailbox over
 * a time window using `calendarView`, which expands recurring series into
 * concrete instances — so a weekly demo slot yields one event per occurrence.
 *
 * Read-only and mailbox-scoped: every request targets `/users/{mailbox}/…`,
 * the mailbox being passed explicitly (demos live mostly in sdv@we-comply.be).
 */
export class GraphCalendarClient {
  private readonly client: Client;
  private readonly maxRetries: number;

  constructor(config: CalendarClientConfig) {
    const credential = new ClientSecretCredential(
      config.tenantId,
      config.clientId,
      config.clientSecret,
    );
    const authProvider = new TokenCredentialAuthenticationProvider(credential, {
      scopes: ['https://graph.microsoft.com/.default'],
    });
    this.client = Client.initWithMiddleware({ authProvider });
    this.maxRetries = config.maxRetries ?? 5;
  }

  private async get<T>(requestUrl: string): Promise<T> {
    let attempt = 0;
    for (;;) {
      try {
        return (await this.client.api(requestUrl).get()) as T;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        const retryable = status === 429 || status === 503 || status === 504;
        if (!retryable || attempt >= this.maxRetries) throw error;
        const backoff = 2 ** attempt * 500;
        await sleep(backoff + Math.floor(backoff * 0.25 * Math.random()));
        attempt += 1;
      }
    }
  }

  /**
   * Events of `mailbox` whose start falls in [since, until]. Recurring series
   * are expanded to instances. Cancelled events are dropped.
   */
  async listEvents(mailbox: string, since: Date, until: Date): Promise<CalendarEvent[]> {
    const params = new URLSearchParams({
      startDateTime: since.toISOString(),
      endDateTime: until.toISOString(),
      $select: EVENT_SELECT,
      $orderby: 'start/dateTime',
      $top: '100',
    });
    let url: string | undefined =
      `/users/${encodeURIComponent(mailbox)}/calendarView?${params.toString()}`;

    const out: CalendarEvent[] = [];
    while (url) {
      const page: EventsPage = await this.get<EventsPage>(url);
      for (const e of page.value) {
        if (e.isCancelled) continue;
        const attendees = [
          e.organizer?.emailAddress?.address,
          ...(e.attendees ?? []).map((a) => a.emailAddress?.address),
        ]
          .map((a) => a?.trim().toLowerCase())
          .filter((a): a is string => !!a && a.includes('@'));
        const startIso = e.start?.dateTime;
        if (!startIso) continue;
        // Graph returns calendarView instances in UTC when the request has no
        // Prefer:outlook.timezone header (default), so parse as-is.
        out.push({
          id: e.id,
          subject: e.subject ?? '',
          start: new Date(startIso.endsWith('Z') ? startIso : `${startIso}Z`),
          attendees: [...new Set(attendees)],
        });
      }
      url = page['@odata.nextLink'];
    }
    return out;
  }
}
