import { and, asc, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import {
  prospectContacts,
  prospects,
  type NewProspect,
  type Prospect,
  type ProspectContact,
} from '../db/schema.js';
import {
  DEFAULT_SEQUENCE_CONFIG,
  evaluateSequence,
  type SequenceAction,
  type SequenceConfig,
} from './sequence.js';

export interface ProspectsServiceDeps {
  db: Db;
}

/** Commercial funnel position — where the deal stands (agency-level). */
export type PipelineStage =
  | 'to_contact'
  | 'contacted'
  | 'demo_planned'
  | 'demo_done'
  | 'offer_to_send'
  | 'offer_sent'
  | 'won'
  | 'lost';

/** Why a deal was lost (`pipeline_stage = 'lost'`). */
export type LostReason =
  | 'not_interested'
  | 'budget'
  | 'wrong_target'
  | 'unreachable'
  | 'other';

/** A prospect agency together with its people. */
export type ProspectWithContacts = Prospect & { contacts: ProspectContact[] };

/** One person at the agency, as provided by an import. */
export interface ContactImport {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
}

/** Agency-level fields an import may set (only provided keys are written). */
export type ProspectImport = Pick<
  NewProspect,
  | 'societe'
  | 'siteInternet'
  | 'verticale'
  | 'language'
  | 'owner'
  | 'sourceStatus'
  | 'pipelineStage'
  | 'lostReason'
  | 'noShow'
  | 'needsReview'
  | 'mrr'
  | 'conversionProbability'
  | 'leadFrom'
  | 'meetingDate'
  | 'offerSentAt'
  | 'lastReplyAt'
  | 'lastReplySubject'
  | 'calledAt'
  | 'notes'
> & {
  /** The person we talk to — becomes/updates the primary contact. */
  contact?: ContactImport;
  /** Extra known addresses — stored as secondary email-only contacts. */
  otherEmails?: string[];
  /**
   * Funnel stage applied only when the agency is CREATED — a weaker signal
   * than `pipelineStage`, which always wins. Lets the CSV import place new
   * prospects at 'offer_sent' without downgrading richer existing stages
   * (e.g. a 'won'/'lost' set by the Notion board import).
   */
  pipelineStageOnCreate?: PipelineStage;
};

function normalizeEmail(raw: string | null | undefined): string | null {
  const e = raw?.trim().toLowerCase();
  return e && e.includes('@') ? e : null;
}

/**
 * Idempotent import of one agency + its contact(s).
 *
 * Matching order: (1) any known contact email, (2) case-insensitive agency
 * name. On a match the agency's provided fields are refreshed — progress facts
 * (`offerSentAt`, `lastReplyAt`, …) and the contact phone are never blanked by
 * an empty import value (live reply detection in P2 owns them afterwards).
 * Returns whether an agency row was created. The caller runs the tick
 * afterwards to set stage/next_action.
 */
export async function upsertProspect(
  { db }: ProspectsServiceDeps,
  input: ProspectImport,
): Promise<{ created: boolean; id: string }> {
  const societe = input.societe.trim();
  const primaryEmail = normalizeEmail(input.contact?.email);
  const allEmails = [
    ...new Set([primaryEmail, ...(input.otherEmails ?? []).map(normalizeEmail)]),
  ].filter((e): e is string => e !== null);

  // 1. Match by any contact address, else 2. by agency name.
  let prospectId: string | null = null;
  let matchedByEmail = false;
  if (allEmails.length > 0) {
    const [byEmail] = await db
      .select({ prospectId: prospectContacts.prospectId })
      .from(prospectContacts)
      .where(inArray(prospectContacts.email, allEmails))
      .limit(1);
    if (byEmail) {
      prospectId = byEmail.prospectId;
      matchedByEmail = true;
    }
  }
  if (!prospectId) {
    // Compare with the SAME expression as the unique index (Postgres lower()),
    // not JS toLowerCase() — they disagree on accented chars in some locales.
    const [byName] = await db
      .select({ id: prospects.id })
      .from(prospects)
      .where(sql`lower(${prospects.societe}) = lower(${societe})`)
      .limit(1);
    if (byName) prospectId = byName.id;
  }

  const agencyFields: Partial<NewProspect> = {
    // An email match never RENAMES the agency: shared mailboxes across two
    // agency spellings would steal a name already held by another row
    // (unique lower(societe)). The name only sets on create or a name match.
    ...(matchedByEmail ? {} : { societe }),
    ...definedOnly({
      siteInternet: input.siteInternet,
      verticale: input.verticale,
      language: input.language,
      owner: input.owner,
      sourceStatus: input.sourceStatus,
      pipelineStage: input.pipelineStage,
      lostReason: input.lostReason,
      noShow: input.noShow,
      needsReview: input.needsReview,
      mrr: input.mrr,
      conversionProbability: input.conversionProbability,
      leadFrom: input.leadFrom,
      meetingDate: input.meetingDate,
      notes: input.notes,
    }),
    // Never blank progress facts on a re-import when the source cell is empty.
    ...(input.offerSentAt ? { offerSentAt: input.offerSentAt } : {}),
    ...(input.lastReplyAt ? { lastReplyAt: input.lastReplyAt } : {}),
    ...(input.lastReplySubject ? { lastReplySubject: input.lastReplySubject } : {}),
    ...(input.calledAt ? { calledAt: input.calledAt } : {}),
  };

  let created = false;
  if (prospectId) {
    await db
      .update(prospects)
      .set({ ...agencyFields, updatedAt: new Date() })
      .where(eq(prospects.id, prospectId));
  } else {
    const [row] = await db
      .insert(prospects)
      .values({
        ...(input.pipelineStageOnCreate
          ? { pipelineStage: input.pipelineStageOnCreate }
          : {}),
        ...agencyFields,
      } as NewProspect)
      .returning({ id: prospects.id });
    prospectId = row!.id;
    created = true;
  }

  await upsertContacts(db, prospectId, input.contact ?? {}, primaryEmail, allEmails);
  return { created, id: prospectId };
}

/** Keep only keys whose value is not undefined (null IS a deliberate value). */
function definedOnly<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}

/**
 * Ensure the agency's contacts reflect the import: the primary contact carries
 * the person's name/phone/role, every known address exists as a contact row,
 * and exactly one contact ends up primary. Inserts tolerate address collisions
 * (unique email) by skipping — an address can only belong to one agency.
 */
async function upsertContacts(
  db: Db,
  prospectId: string,
  contact: ContactImport,
  primaryEmail: string | null,
  allEmails: string[],
): Promise<void> {
  const existing = await db
    .select()
    .from(prospectContacts)
    .where(eq(prospectContacts.prospectId, prospectId));

  const byEmail = new Map(existing.filter((c) => c.email).map((c) => [c.email!, c]));
  let primary = existing.find((c) => c.isPrimary) ?? null;

  // The person of this import: update the row holding their address, else the
  // current primary (when it has no address yet), else insert.
  const personRow = (primaryEmail ? byEmail.get(primaryEmail) : null) ?? primary;
  if (personRow) {
    await db
      .update(prospectContacts)
      .set({
        ...(contact.name ? { name: contact.name } : {}),
        ...(primaryEmail && !personRow.email ? { email: primaryEmail } : {}),
        // Never blank an existing phone with an empty import value.
        ...(contact.phone ? { phone: contact.phone } : {}),
        ...(contact.role ? { role: contact.role } : {}),
        updatedAt: new Date(),
      })
      .where(eq(prospectContacts.id, personRow.id));
    if (!primary) {
      await db
        .update(prospectContacts)
        .set({ isPrimary: true, updatedAt: new Date() })
        .where(eq(prospectContacts.id, personRow.id));
      primary = personRow;
    }
  } else if (contact.name || contact.phone || primaryEmail) {
    await db
      .insert(prospectContacts)
      .values({
        prospectId,
        name: contact.name ?? null,
        email: primaryEmail,
        phone: contact.phone ?? null,
        role: contact.role ?? null,
        isPrimary: true,
      })
      .onConflictDoNothing();
    primary = { isPrimary: true } as ProspectContact; // presence marker only
  }

  // Secondary addresses become email-only contact rows (reply matching).
  const secondary = allEmails.filter((e) => e !== primaryEmail && !byEmail.has(e));
  for (const email of secondary) {
    await db
      .insert(prospectContacts)
      .values({ prospectId, email, isPrimary: false })
      .onConflictDoNothing();
  }
}

/** Load contacts for a set of prospects (primary first). */
async function attachContacts(db: Db, rows: Prospect[]): Promise<ProspectWithContacts[]> {
  if (rows.length === 0) return [];
  const contacts = await db
    .select()
    .from(prospectContacts)
    .where(inArray(prospectContacts.prospectId, rows.map((r) => r.id)))
    .orderBy(desc(prospectContacts.isPrimary), asc(prospectContacts.createdAt));
  const grouped = new Map<string, ProspectContact[]>();
  for (const c of contacts) {
    const list = grouped.get(c.prospectId) ?? [];
    list.push(c);
    grouped.set(c.prospectId, list);
  }
  return rows.map((r) => ({ ...r, contacts: grouped.get(r.id) ?? [] }));
}

export async function listProspects({
  db,
}: ProspectsServiceDeps): Promise<ProspectWithContacts[]> {
  const rows = await db.select().from(prospects).orderBy(asc(prospects.societe));
  return attachContacts(db, rows);
}

/** One agency with its contacts, or null. */
export async function getProspect(
  { db }: ProspectsServiceDeps,
  id: string,
): Promise<ProspectWithContacts | null> {
  const rows = await db.select().from(prospects).where(eq(prospects.id, id)).limit(1);
  if (rows.length === 0) return null;
  const [withContacts] = await attachContacts(db, rows);
  return withContacts ?? null;
}

/** Update the free-text notes of an agency (detail page). */
export async function updateProspectNotes(
  { db }: ProspectsServiceDeps,
  id: string,
  notes: string | null,
): Promise<void> {
  await db
    .update(prospects)
    .set({ notes: notes?.trim() || null, updatedAt: new Date() })
    .where(eq(prospects.id, id));
}

/** The call-list: prospects that hit +15d with no reply, oldest offer first. */
export async function listCallList({
  db,
}: ProspectsServiceDeps): Promise<ProspectWithContacts[]> {
  const rows = await db
    .select()
    .from(prospects)
    .where(eq(prospects.stage, 'to_call'))
    .orderBy(asc(prospects.offerSentAt));
  return attachContacts(db, rows);
}

export interface MarkCalledInput {
  outcome: 'reachable' | 'callback' | 'not_interested' | 'signed';
  calledAt?: Date;
  notes?: string;
}

/** Log a call outcome; closes the sequence (stage → 'closed'). */
export async function markProspectCalled(
  { db }: ProspectsServiceDeps,
  id: string,
  input: MarkCalledInput,
): Promise<void> {
  await db
    .update(prospects)
    .set({
      calledAt: input.calledAt ?? new Date(),
      outcome: input.outcome,
      stage: 'closed',
      nextActionAt: null,
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      updatedAt: new Date(),
    })
    .where(eq(prospects.id, id));
}

/**
 * Move a prospect to another funnel stage (manual board action). Reaching a
 * terminal deal state (won/lost) also closes the chase cadence; leaving it
 * re-opens nothing — the tick recomputes the cadence from the stored facts.
 */
export async function setProspectPipelineStage(
  { db }: ProspectsServiceDeps,
  id: string,
  pipelineStage: PipelineStage,
  lostReason: LostReason | null = null,
): Promise<void> {
  const terminal = pipelineStage === 'won' || pipelineStage === 'lost';
  await db
    .update(prospects)
    .set({
      pipelineStage,
      lostReason: pipelineStage === 'lost' ? lostReason ?? 'other' : null,
      ...(terminal ? { stage: 'closed', nextActionAt: null } : {}),
      updatedAt: new Date(),
    })
    .where(eq(prospects.id, id));
}

/**
 * Set/replace the phone of the agency's primary contact (manual entry from the
 * call-list UI). Creates a primary contact when the agency has none yet.
 */
export async function setProspectPhone(
  { db }: ProspectsServiceDeps,
  prospectId: string,
  phone: string | null,
): Promise<void> {
  const [target] = await db
    .select({ id: prospectContacts.id })
    .from(prospectContacts)
    .where(eq(prospectContacts.prospectId, prospectId))
    .orderBy(desc(prospectContacts.isPrimary), asc(prospectContacts.createdAt))
    .limit(1);

  if (target) {
    await db
      .update(prospectContacts)
      .set({ phone, updatedAt: new Date() })
      .where(eq(prospectContacts.id, target.id));
  } else if (phone) {
    await db.insert(prospectContacts).values({ prospectId, phone, isPrimary: true });
  }
}

export interface TickSummary {
  scanned: number;
  transitioned: number;
  /** Prospects whose reminder is due (drafts to prepare — sending is deferred). */
  remindersDue: string[];
  /** Prospects newly moved onto the call-list. */
  addedToCallList: string[];
}

/**
 * Recompute every prospect's cadence stage as of `now` and persist the derived
 * `stage` / `next_action_at`. Pure decisions come from `evaluateSequence`; this
 * only writes back changes and reports which actions are due.
 *
 * Deals already decided (`pipeline_stage` won/lost) are never chased. Sending
 * the reminder e-mail is intentionally NOT done here — the reminder is a
 * 1-click officer-validated draft built in a later phase. A due reminder is
 * reported (and re-reported until sent), which is idempotent by design.
 */
export async function tickProspects(
  { db }: ProspectsServiceDeps,
  now: Date = new Date(),
  config: SequenceConfig = DEFAULT_SEQUENCE_CONFIG,
): Promise<TickSummary> {
  // Only rows that can still move: skip terminal cadence stages + decided deals.
  const rows = await db
    .select()
    .from(prospects)
    .where(
      sql`${prospects.stage} not in ('replied', 'closed')
        and ${prospects.pipelineStage} not in ('won', 'lost')`,
    );

  const summary: TickSummary = {
    scanned: rows.length,
    transitioned: 0,
    remindersDue: [],
    addedToCallList: [],
  };

  for (const row of rows) {
    const res = evaluateSequence(
      {
        offerSentAt: row.offerSentAt,
        lastReplyAt: row.lastReplyAt,
        reminderSentAt: row.reminderSentAt,
        calledAt: row.calledAt,
      },
      now,
      config,
    );

    trackAction(row.id, res.action, summary);

    const stageChanged = res.stage !== row.stage;
    const dueChanged = !sameInstant(res.dueAt, row.nextActionAt);
    if (stageChanged || dueChanged) {
      await db
        .update(prospects)
        .set({ stage: res.stage, nextActionAt: res.dueAt, updatedAt: new Date() })
        .where(eq(prospects.id, row.id));
      if (stageChanged) summary.transitioned++;
    }
  }

  return summary;
}

function trackAction(id: string, action: SequenceAction, summary: TickSummary): void {
  if (action.type === 'send_reminder') summary.remindersDue.push(id);
  else if (action.type === 'add_to_call_list') summary.addedToCallList.push(id);
}

function sameInstant(a: Date | null, b: Date | null): boolean {
  if (a === null || b === null) return a === b;
  return a.getTime() === b.getTime();
}

/**
 * Count agencies due to be called that have no reachable contact (no phone on
 * any contact) — surfaces the "numéro à ajouter" gap for the call-list UI.
 */
export async function countCallListMissingPhone({
  db,
}: ProspectsServiceDeps): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(prospects)
    .where(
      and(
        eq(prospects.stage, 'to_call'),
        sql`not exists (
          select 1 from ${prospectContacts}
          where ${prospectContacts.prospectId} = ${prospects.id}
            and ${prospectContacts.phone} is not null
        )`,
      ),
    );
  return row?.n ?? 0;
}

/** True once at least one contact carries a phone (import brought numbers in). */
export async function hasAnyProspectPhone({
  db,
}: ProspectsServiceDeps): Promise<boolean> {
  const [row] = await db
    .select({ id: prospectContacts.id })
    .from(prospectContacts)
    .where(isNotNull(prospectContacts.phone))
    .limit(1);
  return Boolean(row);
}
