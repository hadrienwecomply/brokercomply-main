---
title: "FP — SharePoint document sync (broker folders + Documents tab)"
status: in-progress
created: 2026-06-23
owner: founder
branch: feat/sharepoint-doc-sync
---

# Feature Plan — SharePoint document sync

## Summary

Each broker gets a dedicated **SharePoint folder**, auto-created when the broker is
created, and a **Documents tab** on the broker detail page. The integration is
**bidirectional**: files added in SharePoint appear in the platform (folder-scoped
delta sync → `broker_documents` metadata mirror), and files uploaded from the
platform are pushed to SharePoint. SharePoint is the **source of truth for content**;
the DB only mirrors metadata.

Reuses the existing app-only Microsoft Graph setup (the same Entra app registration
used for email ingestion), extended with a `Sites.Selected` **write** grant on the
`ClineSacha` site.

## Scope

In scope:
- Shared SharePoint Graph client (`packages/shared/src/sharepoint/`): idempotent folder
  provisioning, upload (simple + session), folder-scoped delta.
- DB: `broker_documents` mirror + `sharepoint_sync_state` (per-broker delta token) +
  `brokers` SharePoint columns.
- Auto-create folder on broker creation (best-effort, non-blocking).
- Pull sync engine + CLI (`sync:sharepoint`) for scheduled + manual sync.
- Documents tab (App Router subroutes) with list / open / download / upload / sync.
- Idempotent backfill CLI (`backfill:sharepoint`) for the existing brokers.

Out of scope (future):
- Real-time webhooks (Graph subscriptions) — scheduled polling in v1.
- In-platform delete/rename of files (upload + download/open only).
- Renaming/moving the SharePoint folder when a broker is renamed.
- A full folder-tree UI (flat file list in v1).

## Design decisions (resolved with the user)

| # | Decision | Resolution |
|---|----------|------------|
| 0 | Permission model | **`Sites.Selected`** + per-site **`write`** grant on `ClineSacha` (least privilege). |
| 1 | Folder name | **Company name (`societe`)**, sanitized; `slug` stays the DB/URL key. |
| 2 | Same-name brokers | **Block** + status `error` (never share a folder / mix documents). |
| 3 | Delta scope | **Per broker folder** (`/items/{folderId}/delta`), one token per broker. |
| 4 | Sync trigger | **Hourly cron + manual "Synchroniser" button**. |
| 5 | UI structure | **App Router subroutes** (`/courtiers/[id]/documents`). |
| 6 | File access | **Open in SharePoint (webUrl)** + **download via 302** to the short-lived URL. |
| 7 | Upload conflict | **`rename`** (never overwrite a compliance document). |
| 8 | Folder create timing | **Inline + ~10s timeout**, best-effort, non-blocking (no rollback). |
| 9 | Backfill | **Explicit JSON mapping + auto-match by name + create-if-absent**, `--dry-run` default. |
| 10 | Doc display | **Flat file list + relative path** (files and folders mirrored; files shown). |
| 11 | Broker rename | **Do not touch** the SharePoint folder (linked by id). |

Invariants: GET-before-create + `conflictBehavior: fail` on folders, **never DELETE
remotely**, soft-delete only in the DB mirror, backfill dry-run by default.

## Data model

- `brokers` (+ columns): `sharepoint_folder_id`, `sharepoint_web_url`,
  `sharepoint_folder_path`, `sharepoint_status` (`linked|pending|error|null`).
- `broker_documents`: metadata mirror keyed by unique `drive_item_id`
  (name, path, web_url, size, mime_type, is_folder, etag, last_modified_at,
  `deleted_at` soft-delete), FK `broker_id` cascade.
- `sharepoint_sync_state`: PK `broker_id` (FK cascade) + `folder_item_id`,
  `delta_link`, `last_synced_at`.

Migration: `0005_daily_vin_gonzales.sql` (additive).

## Key files

- `packages/shared/src/sharepoint/{types,paths,transport,client}.ts` — Graph client.
- `packages/shared/src/documents/{service,sync,backfill}.ts` — mirror service, delta
  reconcile, pure backfill decision.
- `apps/dashboard/src/lib/{sharepoint.server,documents.server,documents-actions}.ts`.
- `apps/dashboard/app/courtiers/[id]/{layout,page,documents/page}.tsx`,
  `src/components/{broker-tabs,documents-tab}.tsx`.
- `apps/dashboard/app/api/brokers/[id]/documents/route.ts` (upload),
  `.../[itemId]/download/route.ts` (download).
- CLIs: `tools/kb-compliance/scripts/{sync-sharepoint,backfill-sharepoint-folders}.ts`.

## Testing

Vitest (Graph mocked via an injectable transport; DB integration where a dev DB is
reachable): path/sanitize helpers, idempotent folder ensure, upload (simple +
session chunking with `rename`), folder delta (paging + 410 resync), doc upsert /
soft-delete / sync-state, collision detection, delta→mirror reconcile, and the pure
backfill decision matrix. 32 shared tests green; `next build` green.

## Operations

- **Entra (one-time):** add `Sites.Selected` (Application) + admin consent; grant the
  app `write` on `ClineSacha` via `POST /sites/{siteId}/permissions`. Site id +
  `01 - … / 01 - Clients` root captured in env.
- **Schedule:** Heroku Scheduler → `pnpm --filter @brokercomply/kb-compliance sync:sharepoint`
  hourly.
- **Backfill:** author `tools/kb-compliance/config/sharepoint-mapping.json` (gitignored),
  run `backfill:sharepoint --mapping … ` (dry-run), then `--apply`.

## Status

Phases 0–6 done (client, DB, auto-create, sync engine + CLI, Documents tab UI,
backfill CLI). Phase 7 (this doc + env/gitignore + README) in progress. Remaining
before production: Entra write grant verified end-to-end with live credentials, and
the broker→existing-folder mapping authored for backfill.
