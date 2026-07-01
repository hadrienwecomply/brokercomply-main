# BrokerComply (WeComply)

Internal compliance knowledge base and RAG conversational agent for Belgian
insurance broker compliance officers regulated by FSMA. It ingests email threads
from the compliance officers' mailboxes, extracts Q/A pairs into a searchable
knowledge base, and serves answers with source citations and freshness alerts.

See [`CLAUDE.md`](./CLAUDE.md) for architecture, domain rules and phasing, and
[`doc/`](./doc) for the roadmap and guidelines.

## Monorepo layout

- `apps/dashboard` — Next.js dashboard (brokers CRM, action plan, **Conversations** tab, FAQ).
- `packages/shared` — shared library (DB schema, config, conversations/knowledge/mail services).
- `tools/kb-compliance` — ingestion + distillation pipeline (Microsoft Graph → AML filter → Postgres).

## Broker Conversations tab — email ingestion

The per-broker **Conversations** tab reads the immutable, AML-filtered
`source_documents` archive in Postgres. That archive is populated by ingesting
the compliance officers' mailboxes via Microsoft Graph; the tab itself does **no**
live Graph calls.

**Officer mailboxes.** The real officers are **Sacha (`sdv@we-comply.be`)** and
**Grégory (`gr@we-comply.be`)**. They are configured via the `OFFICER_MAILBOXES`
env var (comma-separated), which drives both the ingestion scope and the
inbound/outbound direction classification. New compliance officers are added by
appending their address to this var — no code change.

> ⚠️ An older config defaulted to `mvl@we-comply.be` as the second officer; that
> was a mistake and has been corrected to `gr@we-comply.be`.

**Populating the tab (backfill).** Conversations only appear once the mailboxes
have been ingested. From `tools/kb-compliance`:

```bash
# 12-month backfill (scoped to the signed-client allowlist by default)
pnpm ingest --mailbox sdv@we-comply.be --since 2025-06-24
pnpm ingest --mailbox gr@we-comply.be  --since 2025-06-24

# Ongoing incremental sync (cheap to run on a schedule)
pnpm ingest:delta
```

The pipeline cleans each message at ingestion (HTML→text, strips quoted replies,
signatures and logos), runs the AML guard-rail (CTIF / suspicion content is
excluded from storage — only a counter is kept), and groups messages into threads.

**Persistence.** Ingested emails live in Postgres (`source_documents`), not in
git — they survive branch switches, merges and restarts. ⚠️ Do **not** run the
DB integration tests against the dev database: they delete real data, and you
would need to re-run the backfill.
