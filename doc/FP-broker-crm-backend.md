---
title: "FP — Broker CRM backend + Action-plan persistence"
status: done
created: 2026-06-22
completed: 2026-06-22
owner: founder
---

# Feature Plan — Broker CRM backend + Action-plan persistence

## Summary

Give BrokerComply a **real backend** for brokers (clients), replacing the in-memory
mock (`apps/dashboard/src/lib/mock-data.ts`). Brokers become a CRM-like entity
persisted in Postgres, each one connected to a persisted instance of the standard
**13-step action plan**. Adds a "create new broker" feature and cuts the dashboard
(portfolio, broker detail, actions cockpit) over from mock data to the database.

Source of truth for the real data = the Notion databases **🤵‍♂️ Espace clients
(signés)** (44 signed clients, already relation-linked to a *Plan d'action* DB) and
**Clients** (richer CRM fields). For this iteration we seed from the repo's
`brokers.seed.json` (the 44) and treat Notion enrichment/sync as a later phase.

## Scope

In scope:
- `brokers`, `broker_plan_steps`, `broker_plan_substeps` tables (Drizzle + Postgres).
- Brokers service in `@brokercomply/shared` (CRUD + plan instantiate/query).
- Dashboard server wiring + `"use server"` actions.
- Create-broker modal form + entry point on the portfolio.
- Idempotent seed of the 44 brokers.
- Cutover of portfolio, broker detail, actions cockpit to the DB.

Out of scope (future phases):
- Diagnostic-driven step applicability (here it's template-default + manual toggle).
- Two-way Notion sync / bulk Notion import.
- Per-action (sub-step) assignment and multi-contact sub-table.
- Auth (still none in v1 — private network, cookie officer identity).

## Design decisions (resolved with the user)

| # | Decision | Resolution |
|---|----------|------------|
| 1 | Identity & routing | **uuid PK + unique `slug`**; routes stay `/courtiers/[slug]`. FKs target uuid. |
| 2 | Step applicability | **Template default + per-step manual toggle** in the workspace. Diagnostic-driven = future. |
| 3 | Plan materialisation | **All 13 steps + their sub-steps** persisted per broker; `applicable` is a flag, never insert/delete. |
| 4 | Status fields | **Store `status`** (lifecycle: onboarding/active/at_risk/inactive); **derive `onboarding_stage`** from plan step-01 progress. |
| 5 | Deadlines | **Derived at read time** (`signature_date + sla_days`) + optional per-step **`deadline_override`**. Effective = `override ?? computed`. |
| 6 | Unique key | **Unique `slug`** (seed upserts by slug); **partial-unique `bce`** (`WHERE bce IS NOT NULL`). |
| 7 | Officers | **Static config** (`officers.ts`, email identity); `account_owner` is a text column validated against it. No officers table. |
| 8 | Clock | **Real server-side `now()`** passed as `today` prop. Drop the frozen `TODAY`. |

Default calls (not vetoed):
- Sub-steps carry only `status` / `notes` / `completed_at` — no own assignee/deadline.
- `emails` is an array + single `contact_name` (no multi-contact table yet).
- "New broker" = a button on the portfolio opening the editor modal (no `/courtiers` index page).

## Data model

### `brokers` (uuid PK)
`slug` (unique), `societe`, `contact_name`, `emails` (jsonb string[]), `phone`,
`website`, `bce` (partial-unique), `fsma_number`, `address`, `city`,
`countries` (jsonb string[]), `language` (FR|NL|EN), `size_bucket`
(`1|2-5|6-10|11-20|21-50|51+`), `product` (BrokerComply|EstateComply),
`linkedin_url`, `status` (onboarding|active|at_risk|inactive), `mrr` (numeric),
`signature_date` (date), `last_contact_date` (date), `account_owner` (officer email),
`notion_page_id`, `created_at`, `updated_at`.

Derived, **not** stored: `onboarding_stage`, `arr` (= mrr×12), step `deadline`.

### `broker_plan_steps` (uuid PK)
`broker_id` → brokers (cascade delete), `code` (`"01"`,`"03.01"`…), `applicable`,
`deadline_override` (nullable date), `position`. Static `title`/`sla_days`/copy come
from the template by `code`. Unique on `(broker_id, code)`.

### `broker_plan_substeps` (uuid PK)
`step_id` → broker_plan_steps (cascade delete), `template_substep_id`,
`status` (not_started|in_progress|waiting_client|blocked|done), `completed_at`
(nullable), `notes` (nullable), `position`. Unique on `(step_id, template_substep_id)`.

> The template (`plan-template.ts`) stays the single source for static content
> (titles, SLA, actions, email templates, supports). The DB holds only what changes.
> A small shared `plan-blueprint` (codes + sla + substep ids + defaultApplicable) is
> used by both the seed and the create flow to materialise rows.

## Architecture / layering

- `@brokercomply/shared` `brokers/service.ts`: pure DB functions
  (`createBrokerWithPlan`, `listBrokers`, `getBrokerBySlug`, `updateBroker`,
  `setStepApplicable`, `setStepDeadlineOverride`, `setSubstepStatus`, plan readers).
  No template/DTO knowledge.
- Dashboard `brokers.server.ts`: assembles the existing `Broker` DTO (with the full
  `plan: PlanStep[]`) by merging DB rows with the template; computes deadlines and
  `onboarding_stage`.
- Dashboard `broker-actions.ts`: `"use server"` actions (create, update,
  toggle step, set sub-step status) + `revalidatePath`.
- Seed: `apps/dashboard/scripts` (can import both the shared client and the template).

## Phases / build order

1. **This doc.**
2. Schema + migration `0004` (3 tables + enums).
3. `brokers/service.ts` + vitest tests (TDD: create→plan instantiated with correct
   deadlines; toggle applicable; set sub-step status; list/get; seed idempotency).
4. Dashboard `brokers.server.ts` + `broker-actions.ts`.
5. `broker-editor.tsx` + portfolio "New broker" button (auto-instantiate plan).
6. Idempotent seed of the 44 brokers (upsert by slug; deterministic plan).
7. Cutover: `courtiers/[id]`, portfolio, actions cockpit → DB; real `now()`.

## Success criteria

- A new broker can be created from the UI and immediately appears with a full,
  navigable 13-step plan.
- The 44 seeded brokers render in the portfolio/cockpit identically in shape to today.
- Re-running the seed is a no-op (idempotent by slug).
- No component still imports `mock-data.ts` for broker data after cutover.
- Service layer ≥ 80% covered.

## Risks

- **DB tests wipe dev data** (existing project note): run service tests against a
  separate test DB; keep the seed idempotent.
- **Mock→DB cutover** touches several components — do it in one step to avoid a
  half-mocked state; keep the deterministic plan logic reusable for the seed.
- **Officer identity mismatch**: mock uses `sacha`/`gregory` ids; real config uses
  emails. Standardise on email (`officers.ts`) during cutover.
- **Notion is not yet canonical**: no row-query tool available; real enrichment is a
  later, partly manual phase.

## Journal d'exécution

- 2026-06-22 — Built end to end: schema + migration `0004`; `brokers/service.ts`
  (8 vitest cases, all green); dashboard `brokers.server.ts` + `broker-actions.ts`;
  `broker-editor.tsx` + `new-broker-button.tsx`; idempotent seed of 44 brokers;
  cutover of portfolio / broker detail / actions cockpit to the DB; deleted
  `mock-data.ts`. Full suite 128/128, `next build` clean, runtime smoke test OK.
- 2026-06-22 — Code review pass: fixed all 4 HIGH (race-safe `upsertBrokerBySlug`
  via unique-violation catch; typed `BrokerPatch` excluding generated columns;
  transactional `--force` reseed; ownership checks on plan-mutation actions) +
  MEDIUM (locale-aware `parseMrr`, `formatDate` invalid-date guard, sub-step
  ordering warning) + LOW (single test connection). Re-verified green.

## Follow-ups (confirmed during build)

- **Integration tests wipe the dev DB.** `brokers/service.test.ts` (like the existing
  knowledge tests) deletes from `brokers` against the default DB, so running the
  full suite clears the 44 seeded brokers — re-run the seed afterwards. Proper fix:
  point integration tests at a dedicated `TEST_DATABASE_URL`.
- **Wire the workspace sub-step mutations to the UI.** `setSubstepStatus` /
  `setStepApplicable` actions exist and the DTO threads `dbId`s through; the
  workspace components still need their controls hooked up (next iteration).
- Notion enrichment/sync of the real CRM fields (MRR, FSMA, dates) — separate phase.
