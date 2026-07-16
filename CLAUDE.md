# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**BrokerComply** (WeComply) is an internal compliance knowledge base and RAG conversational agent for Belgian insurance broker compliance officers regulated by FSMA. It ingests email threads from 2 compliance officers' mailboxes, extracts Q/A pairs into a searchable knowledge base, and serves answers via a conversational agent with source citations and freshness alerts.

**Users**: 3 internal users (2 compliance officers + founder). No public-facing auth in v1 — deployed on private network only.

**Languages**: Content is multilingual FR/NL/EN. Code and comments should be in English.

## Development Workflow

**ALWAYS start a new feature in its own git worktree** — never develop directly in the main checkout. Use the repo script (it copies gitignored config like `.env`/`.claude`, installs deps, and creates the branch):

```bash
pnpm wt feat/<name>            # = scripts/new-worktree.sh feat/<name> [--from main]
```

Then work inside the new worktree. This keeps parallel Claude sessions from clobbering each other's uncommitted changes and avoids drizzle migration-number collisions (coordinate migration renumbering at merge time). Clean up with `pnpm wt:rm` when the branch is merged.

## Tech Stack (from PRD)

- **Runtime**: TypeScript / Node.js
- **Email**: Microsoft Graph API (app-only, `Mail.Read` permission via existing Entra registration)
- **Database**: PostgreSQL + `pgvector` (HNSW index for semantic search + `tsvector` for full-text/regulatory ref search)
- **LLM**: Managed API (Claude or OpenAI) with no-training clause, EU region, under DPA
- **Hosting**: Heroku (default proposal, consistent with existing infra)

## Architecture — Two-Layer Data Model

1. **Source layer** (`source_documents`): Immutable cleaned email threads + attachment text + metadata. AML/CTIF content never enters this layer.
2. **Knowledge layer** (`knowledge_units`): Distilled Q/A cards with multilingual embeddings (vector(1536)), topics, regulatory refs, author, confidence score, source_date for freshness tracking.

## Pipeline Stages

1. **Ingestion** — Microsoft Graph: backfill (Phase 0) then daily delta sync. Thread reconstruction, signature/quote cleanup, attachment parsing.
2. **AML Filter** — Conservative exclusion of CTIF/suspicious transaction content before any storage. Bias toward excluding when in doubt.
3. **Distillation** — LLM extraction of canonical Q/A pairs linked to source emails. Multilingual embeddings.
4. **Storage** — Postgres + pgvector. Hybrid search (semantic + lexical). No aggressive deduplication — divergent answers between officers are surfaced together.
5. **RAG Agent** — Hybrid retrieval, LLM synthesis with mandatory citations, source dates, freshness alerts (default threshold: 12 months, configurable).

## Key Domain Rules

- **AML exclusion is critical**: Any content related to suspicious transaction reports (CTIF/déclarations de soupçon) must be excluded before storage. Only an exclusion counter is kept, never content.
- **Divergences are features**: When officers gave different answers, both are returned with attribution — never silently merged.
- **Freshness alerts**: Entries older than configurable threshold (default 12 months) are flagged as potentially outdated.
- **Source citation is mandatory**: Every agent response must cite source emails, dates, and author.
- **No deduplication**: Prefer surfacing duplicate/divergent entries over losing information.

## Phasing

- **Phase 0**: Local prototype — sample data, basic pipeline, AML guard-rail
- **Phase 1**: Full backfill of 2 mailboxes, Q/A extraction, embeddings
- **Phase 2**: Conversational agent with RAG, citations, freshness alerts
- **Phase 3**: Daily delta sync, freshness review, coverage/reuse metrics
- **Production gate**: DPA clause documented, AML rule finalized, hosting chosen, agent answers majority of searches usefully
