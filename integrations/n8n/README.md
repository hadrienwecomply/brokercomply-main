# n8n workflows

n8n runs as a **separate service** — BrokerComply only triggers it over HTTP. This
folder holds the **JSON exports** of the workflows (backup + code review). They
are not executed from here; import them into your n8n instance.

## How it connects

```
Fillout ──► POST /api/webhooks/fillout/<token>   (BrokerComply, inbound)
                │  auth: URL token + X-Webhook-Secret
                │  match broker (email→domain→name) or auto-create
                │  persist submission (idempotent on submissionId)
                └─► POST <n8n webhook>            (BrokerComply, outbound)
                        header: X-N8n-Secret: <N8N_WEBHOOK_SECRET>
```

- Default outbound URL: `N8N_WEBHOOK_URL`. A form can override it per `formId`
  in `apps/dashboard/src/lib/form-template.ts`.
- The n8n **Webhook** node should require Header Auth on `X-N8n-Secret`
  (value = `N8N_WEBHOOK_SECRET`).

## Trigger payload contract

Defined by `buildN8nPayload` in `packages/shared/src/integrations/n8n.ts`:

```jsonc
{
  "submissionId": "uuid",            // BrokerComply form_submissions.id
  "filloutSubmissionId": "sub_...",  // Fillout submission id
  "formType": "Onboarding courtier", // label from form-template.ts (or null)
  "matchMethod": "email|domain|name|created|manual",
  "broker": { "id": "uuid", "slug": "cabinet-durand", "societe": "Cabinet Durand", "website": "https://cabinet-durand.be" },
  "answers": [
    { "questionId": "q1", "name": "Votre email", "type": "Email", "value": "..." }
  ]
}
```

If the n8n workflow ends with a **Respond to Webhook** node returning
`{ "executionId": "..." }` (or `id`), BrokerComply stores it on the submission.

## Adding a workflow

1. Build it in n8n, set the Webhook node Header Auth to `X-N8n-Secret`.
2. Register the form in `form-template.ts` (field map + optional `n8nWebhookUrl`).
3. Export the workflow JSON from n8n and commit it here as `<name>.json`.
