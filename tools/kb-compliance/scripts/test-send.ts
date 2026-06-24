import { parseArgs } from 'node:util';
import { GraphMailClient, config } from '@brokercomply/shared';

/**
 * One-shot send test to validate the outbound Graph chain end-to-end:
 * app-only auth → Application Access Policy → send-as an officer mailbox.
 *
 * Safe by design: it sends to a single internal address (default
 * hr@we-comply.be), never to a broker. Run it once after the IT setup
 * (Mail.Send + admin consent + Application Access Policy scoped to officers):
 *
 *   pnpm --filter @brokercomply/kb-compliance test:send
 *   pnpm --filter @brokercomply/kb-compliance test:send --from sdv@we-comply.be --to hr@we-comply.be
 */
async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      from: { type: 'string' },
      to: { type: 'string' },
    },
  });

  if (!config.AZURE_TENANT_ID || !config.AZURE_CLIENT_ID || !config.AZURE_CLIENT_SECRET) {
    throw new Error(
      'AZURE_TENANT_ID / AZURE_CLIENT_ID / AZURE_CLIENT_SECRET requis dans .env pour le test d’envoi.',
    );
  }

  const from = values.from ?? config.OFFICER_MAILBOXES[0];
  const to = values.to ?? 'hr@we-comply.be';
  if (!from) {
    throw new Error('Aucune boîte officer disponible — précisez --from <adresse>.');
  }

  console.log(`[test-send] From=${from} → To=${to}`);
  const client = new GraphMailClient({
    tenantId: config.AZURE_TENANT_ID,
    clientId: config.AZURE_CLIENT_ID,
    clientSecret: config.AZURE_CLIENT_SECRET,
  });

  await client.sendMail({
    from,
    to: [to],
    subject: "[TEST] BrokerComply — validation de la chaîne d'envoi",
    body:
      "Ceci est un e-mail de test envoyé par BrokerComply.\n\n" +
      `Expéditeur (officer) : ${from}\n` +
      'Si vous recevez ce message, alors :\n' +
      "  • l'authentification app-only Microsoft Graph fonctionne ;\n" +
      "  • l'Application Access Policy autorise l'envoi pour cette boîte ;\n" +
      "  • le « send-as » officer est opérationnel.\n",
  });

  console.log('[test-send] ✓ Envoyé (202 Accepted). Vérifiez la réception côté destinataire.');
}

main().catch((error) => {
  console.error('[test-send] échec :', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
