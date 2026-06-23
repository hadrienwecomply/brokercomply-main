import "server-only";
import {
  createBrokerWithPlan,
  getBrokerById,
  getBrokerBySlug,
  listBrokerPlans,
  setStepApplicable,
  setStepDeadlineOverride,
  setSubstepStatus,
  updateBroker,
  upsertBrokerBySlug,
  type BrokerPatch,
  type BrokerPlan,
  type NewBroker,
} from "@brokercomply/shared";
import { getDb } from "./db.server";
import { assemblePlan, deriveOnboardingStatus, planBlueprint } from "./broker-plan";
import { DEFAULT_OFFICER } from "./officers";
import { provisionBrokerFolder } from "./sharepoint.server";
import { brokerSlug } from "./slug";
import type { Broker } from "./types";

/** Map a persisted broker + its plan rows into the rich `Broker` DTO the UI uses. */
export function toBrokerDTO(plan: BrokerPlan): Broker {
  const { broker: row, steps, substeps } = plan;
  const planSteps = assemblePlan(steps, substeps, row.signatureDate);
  const base: Broker = {
    id: row.slug,
    dbId: row.id,
    societe: row.societe,
    contact: row.contactName ?? "",
    emails: row.emails ?? [],
    countries: row.countries ?? [],
    officerId: row.accountOwner ?? DEFAULT_OFFICER,
    signatureDate: row.signatureDate ?? "",
    bce: row.bce ?? undefined,
    website: row.website ?? undefined,
    lastContactDate: row.lastContactDate ?? undefined,
    onboardingStatus: [],
    plan: planSteps,
    phone: row.phone ?? undefined,
    fsmaNumber: row.fsmaNumber ?? undefined,
    address: row.address ?? undefined,
    city: row.city ?? undefined,
    language: row.language ?? undefined,
    sizeBucket: row.sizeBucket ?? undefined,
    product: row.product ?? undefined,
    linkedinUrl: row.linkedinUrl ?? undefined,
    status: row.status ?? undefined,
    mrr: row.mrr != null ? Number(row.mrr) : null,
    notionPageId: row.notionPageId ?? undefined,
    sharePointFolderId: row.sharePointFolderId ?? undefined,
    sharePointWebUrl: row.sharePointWebUrl ?? undefined,
    sharePointFolderPath: row.sharePointFolderPath ?? undefined,
    sharePointStatus: row.sharePointStatus ?? undefined,
  };
  return { ...base, onboardingStatus: deriveOnboardingStatus(base) };
}

export async function listBrokers(): Promise<Broker[]> {
  const plans = await listBrokerPlans({ db: getDb() });
  return plans
    .map(toBrokerDTO)
    .sort((a, b) => a.societe.localeCompare(b.societe, "fr"));
}

export async function getBroker(slug: string): Promise<Broker | undefined> {
  const plan = await getBrokerBySlug({ db: getDb() }, slug);
  return plan ? toBrokerDTO(plan) : undefined;
}

export interface CreateBrokerInput {
  societe: string;
  contact?: string | null;
  emails?: string[];
  countries?: string[];
  phone?: string | null;
  website?: string | null;
  bce?: string | null;
  fsmaNumber?: string | null;
  address?: string | null;
  city?: string | null;
  language?: string | null;
  sizeBucket?: string | null;
  product?: string | null;
  linkedinUrl?: string | null;
  status?: string | null;
  mrr?: number | null;
  signatureDate?: string | null;
  lastContactDate?: string | null;
  accountOwner?: string | null;
}

function toNewBroker(input: CreateBrokerInput, owner: string): NewBroker {
  const societe = input.societe.trim();
  const clean = (v?: string | null) => {
    const t = v?.trim();
    return t ? t : null;
  };
  return {
    slug: brokerSlug(societe),
    societe,
    contactName: clean(input.contact),
    emails: input.emails?.map((e) => e.trim()).filter(Boolean) ?? [],
    countries: input.countries?.map((c) => c.trim()).filter(Boolean) ?? [],
    phone: clean(input.phone),
    website: clean(input.website),
    bce: clean(input.bce),
    fsmaNumber: clean(input.fsmaNumber),
    address: clean(input.address),
    city: clean(input.city),
    language: clean(input.language),
    sizeBucket: clean(input.sizeBucket),
    product: clean(input.product) ?? "BrokerComply",
    linkedinUrl: clean(input.linkedinUrl),
    status: clean(input.status) ?? "onboarding",
    mrr: input.mrr != null ? String(input.mrr) : null,
    signatureDate: clean(input.signatureDate),
    lastContactDate: clean(input.lastContactDate),
    accountOwner: clean(input.accountOwner) ?? owner,
  };
}

/** Create a broker and auto-instantiate its full 13-step plan. */
export async function createBroker(
  input: CreateBrokerInput,
  owner: string,
): Promise<Broker> {
  const plan = await createBrokerWithPlan(
    { db: getDb() },
    { broker: toNewBroker(input, owner), steps: planBlueprint() },
  );
  // Best-effort, non-blocking: provision the broker's SharePoint folder inline
  // (never throws; records 'linked' | 'pending' | 'error'). Re-read so the
  // returned DTO reflects the resulting SharePoint status.
  await provisionBrokerFolder(plan.broker.id, plan.broker.societe);
  const fresh = await getBrokerById({ db: getDb() }, plan.broker.id);
  return toBrokerDTO(fresh ?? plan);
}

/** Idempotent variant used by the seed (no duplicate on re-run). */
export async function seedBroker(
  input: CreateBrokerInput,
  owner: string,
): Promise<{ broker: Broker; created: boolean }> {
  const { plan, created } = await upsertBrokerBySlug(
    { db: getDb() },
    { broker: toNewBroker(input, owner), steps: planBlueprint() },
  );
  return { broker: toBrokerDTO(plan), created };
}

export interface UpdateBrokerPatch {
  societe?: string;
  contact?: string | null;
  emails?: string[];
  countries?: string[];
  phone?: string | null;
  website?: string | null;
  bce?: string | null;
  fsmaNumber?: string | null;
  address?: string | null;
  city?: string | null;
  language?: string | null;
  sizeBucket?: string | null;
  product?: string | null;
  linkedinUrl?: string | null;
  status?: string | null;
  mrr?: number | null;
  signatureDate?: string | null;
  lastContactDate?: string | null;
  accountOwner?: string | null;
}

export async function patchBroker(id: string, patch: UpdateBrokerPatch): Promise<void> {
  const fields: BrokerPatch = {};
  // `societe` is editable, but the slug stays immutable (stable URL key); a blank
  // name is ignored rather than allowed to wipe the required column.
  if (patch.societe !== undefined) {
    const societe = patch.societe.trim();
    if (societe) fields.societe = societe;
  }
  if (patch.contact !== undefined) fields.contactName = patch.contact?.trim() || null;
  if (patch.emails !== undefined) fields.emails = patch.emails.map((e) => e.trim()).filter(Boolean);
  if (patch.countries !== undefined)
    fields.countries = patch.countries.map((c) => c.trim()).filter(Boolean);
  if (patch.phone !== undefined) fields.phone = patch.phone?.trim() || null;
  if (patch.website !== undefined) fields.website = patch.website?.trim() || null;
  if (patch.bce !== undefined) fields.bce = patch.bce?.trim() || null;
  if (patch.fsmaNumber !== undefined) fields.fsmaNumber = patch.fsmaNumber?.trim() || null;
  if (patch.address !== undefined) fields.address = patch.address?.trim() || null;
  if (patch.city !== undefined) fields.city = patch.city?.trim() || null;
  if (patch.language !== undefined) fields.language = patch.language?.trim() || null;
  if (patch.sizeBucket !== undefined) fields.sizeBucket = patch.sizeBucket?.trim() || null;
  if (patch.product !== undefined) fields.product = patch.product?.trim() || "BrokerComply";
  if (patch.linkedinUrl !== undefined) fields.linkedinUrl = patch.linkedinUrl?.trim() || null;
  if (patch.status !== undefined) fields.status = patch.status?.trim() || "onboarding";
  if (patch.mrr !== undefined) fields.mrr = patch.mrr != null ? String(patch.mrr) : null;
  if (patch.signatureDate !== undefined) fields.signatureDate = patch.signatureDate?.trim() || null;
  if (patch.lastContactDate !== undefined)
    fields.lastContactDate = patch.lastContactDate?.trim() || null;
  if (patch.accountOwner !== undefined) fields.accountOwner = patch.accountOwner?.trim() || null;
  await updateBroker({ db: getDb() }, id, fields);
}

/**
 * Confirm a plan step (or sub-step) belongs to the broker identified by `slug`
 * before mutating it — prevents a caller from editing an arbitrary broker's plan
 * by passing a foreign UUID. Returns the broker's plan for membership checks.
 */
async function ownedPlan(slug: string): Promise<BrokerPlan> {
  const plan = await getBrokerBySlug({ db: getDb() }, slug);
  if (!plan) throw new Error("Courtier introuvable");
  return plan;
}

export async function toggleStepApplicable(
  slug: string,
  stepDbId: string,
  applicable: boolean,
): Promise<void> {
  const plan = await ownedPlan(slug);
  if (!plan.steps.some((s) => s.id === stepDbId)) throw new Error("Étape introuvable");
  await setStepApplicable({ db: getDb() }, stepDbId, applicable);
}

export async function overrideStepDeadline(
  slug: string,
  stepDbId: string,
  deadline: string | null,
): Promise<void> {
  const plan = await ownedPlan(slug);
  if (!plan.steps.some((s) => s.id === stepDbId)) throw new Error("Étape introuvable");
  await setStepDeadlineOverride({ db: getDb() }, stepDbId, deadline);
}

export async function changeSubstepStatus(
  slug: string,
  substepDbId: string,
  status: string,
  notes?: string | null,
): Promise<void> {
  const plan = await ownedPlan(slug);
  if (!plan.substeps.some((s) => s.id === substepDbId)) throw new Error("Sous-étape introuvable");
  await setSubstepStatus({ db: getDb() }, substepDbId, status, notes !== undefined ? { notes } : {});
}
