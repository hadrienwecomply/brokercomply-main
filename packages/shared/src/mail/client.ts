import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js';

export interface MailClientConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

export interface OutgoingMail {
  /** Sender mailbox (must be permitted by the Application Access Policy). */
  from: string;
  to: string[];
  cc?: string[];
  /** Where replies should go — typically the broker's account-owner officer. */
  replyTo?: string;
  subject: string;
  /** Plain-text body (v1: contentType=Text). */
  body: string;
}

function recipients(addresses: string[]): Array<{ emailAddress: { address: string } }> {
  return addresses
    .map((a) => a.trim())
    .filter(Boolean)
    .map((address) => ({ emailAddress: { address } }));
}

/**
 * App-only Microsoft Graph mail sender. Sends as a SINGLE shared mailbox, which
 * MUST be restricted by an Exchange Application Access Policy — `Mail.Send`
 * app-only otherwise grants send-as for every mailbox in the tenant.
 *
 * v1: plain-text body, no binary attachments (documents are linked in the body).
 */
export class GraphMailClient {
  private readonly client: Client;

  constructor(config: MailClientConfig) {
    const credential = new ClientSecretCredential(
      config.tenantId,
      config.clientId,
      config.clientSecret,
    );
    const authProvider = new TokenCredentialAuthenticationProvider(credential, {
      scopes: ['https://graph.microsoft.com/.default'],
    });
    this.client = Client.initWithMiddleware({ authProvider });
  }

  /** Send one message. Resolves on Graph's 202 Accepted; throws on failure. */
  async sendMail(mail: OutgoingMail): Promise<void> {
    const message = {
      subject: mail.subject,
      body: { contentType: 'Text', content: mail.body },
      toRecipients: recipients(mail.to),
      ccRecipients: recipients(mail.cc ?? []),
      ...(mail.replyTo ? { replyTo: recipients([mail.replyTo]) } : {}),
    };
    await this.client
      .api(`/users/${encodeURIComponent(mail.from)}/sendMail`)
      .post({ message, saveToSentItems: true });
  }
}
