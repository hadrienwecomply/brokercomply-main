import 'server-only';
import {
  GraphMailClient,
  config,
  getBrokerBySlug,
  listOutboundForBroker,
  logOutboundEmail,
  type OutboundEmail,
} from '@brokercomply/shared';
import { getDb } from './db.server';
import { DEFAULT_OFFICER } from './officers';

export interface SentEmailDTO {
  substepTemplateId: string | null;
  stepCode: string | null;
  subject: string | null;
  to: string[];
  sentByOfficer: string | null;
  sentAt: string; // ISO
}

function toSentDTO(r: OutboundEmail): SentEmailDTO {
  return {
    substepTemplateId: r.substepTemplateId,
    stepCode: r.stepCode,
    subject: r.subject,
    to: r.toAddrs ?? [],
    sentByOfficer: r.sentByOfficer,
    sentAt: new Date(r.sentAt).toISOString(),
  };
}

/** History of template emails sent to a broker (powers the "envoyé le X" badge). */
export async function getSentEmails(brokerDbId: string): Promise<SentEmailDTO[]> {
  const rows = await listOutboundForBroker({ db: getDb() }, brokerDbId);
  return rows.map(toSentDTO);
}

/**
 * Safety guard — the address EVERY outgoing email is redirected to until we go
 * live, so a real broker is never emailed by accident. Explicit `MAIL_REDIRECT_TO`
 * wins; otherwise, outside production, defaults to hr@we-comply.be. Returns null
 * only in production with no explicit override (i.e. real delivery).
 */
export function getMailRedirect(): string | null {
  if (config.MAIL_REDIRECT_TO) return config.MAIL_REDIRECT_TO;
  if (config.NODE_ENV !== 'production') return 'hr@we-comply.be';
  return null;
}

/**
 * True when the send feature is configured. Emails are sent FROM the broker's
 * assigned officer mailbox (not a shared mailbox), so only the app-only Graph
 * credentials are required here — the per-officer send-as permission is granted
 * by the Exchange Application Access Policy, not by env.
 */
export function isMailSendConfigured(): boolean {
  return Boolean(config.AZURE_TENANT_ID && config.AZURE_CLIENT_ID && config.AZURE_CLIENT_SECRET);
}

export interface SendStepEmailInput {
  slug: string;
  stepCode: string | null;
  substepTemplateId: string | null;
  to: string[];
  cc: string[];
  subject: string;
  body: string;
  /** Officer (email) triggering the send — for audit attribution. */
  officer: string;
}

/**
 * Send one action-plan template email FROM the broker's assigned officer mailbox
 * and log it. Because the sender IS the officer, replies come back to them
 * naturally and the sent copy lands in their (ingested) Sent Items — so no
 * Reply-To override is needed. Subject/body/recipients are taken verbatim from
 * the (edited) preview.
 */
export async function sendStepEmail(input: SendStepEmailInput): Promise<void> {
  if (!isMailSendConfigured()) {
    throw new Error(
      "Envoi d'e-mail non configuré : définissez AZURE_TENANT_ID / AZURE_CLIENT_ID / AZURE_CLIENT_SECRET.",
    );
  }
  const to = input.to.map((t) => t.trim()).filter(Boolean);
  if (to.length === 0) throw new Error('Au moins un destinataire est requis.');
  if (!input.subject.trim()) throw new Error("L'objet est requis.");

  const plan = await getBrokerBySlug({ db: getDb() }, input.slug);
  if (!plan) throw new Error('Courtier introuvable');
  // Sender = the assigned officer. One is always assigned at creation (the
  // creator, or Sacha for automated creation); fall back to Sacha defensively.
  const from = plan.broker.accountOwner?.trim() || DEFAULT_OFFICER;
  const cc = input.cc.map((c) => c.trim()).filter(Boolean);

  // Test-mode redirect: send everything to the guard address (with the real
  // recipients shown in the body) until go-live, so no broker is emailed early.
  const redirect = getMailRedirect();
  let sendTo = to;
  let sendCc = cc;
  let subject = input.subject;
  let body = input.body;
  // Reply-To is only set in test mode (to keep replies with us); in normal mode
  // the From officer already receives replies.
  let replyTo: string | undefined;
  if (redirect) {
    body =
      `⚠️ ENVIRONNEMENT DE TEST — destinataires réels :\n` +
      `À : ${to.join(', ') || '—'}\n` +
      `Cc : ${cc.join(', ') || '—'}\n` +
      `\n———\n\n${input.body}`;
    subject = `[TEST] ${input.subject}`;
    sendTo = [redirect];
    sendCc = [];
    replyTo = redirect;
  }

  const client = new GraphMailClient({
    tenantId: config.AZURE_TENANT_ID!,
    clientId: config.AZURE_CLIENT_ID!,
    clientSecret: config.AZURE_CLIENT_SECRET!,
  });
  await client.sendMail({ from, to: sendTo, cc: sendCc, replyTo, subject, body });

  // Log what was ACTUALLY sent (truthful audit); the original intent is captured
  // in the body banner when redirected.
  await logOutboundEmail(
    { db: getDb() },
    {
      brokerId: plan.broker.id,
      stepCode: input.stepCode,
      substepTemplateId: input.substepTemplateId,
      fromMailbox: from,
      toAddrs: sendTo,
      ccAddrs: sendCc,
      replyTo: replyTo ?? null,
      subject,
      body,
      sentByOfficer: input.officer,
    },
  );
}
