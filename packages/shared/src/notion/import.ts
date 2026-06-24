import { Client, iteratePaginatedAPI, isFullPage } from '@notionhq/client';
import type { PageObjectResponse } from '@notionhq/client';
import { mapNotionStatus, parseStepCode, type SubstepStatus } from './mapping.js';

/** One Notion "Plan d'action" task resolved to its broker + section. */
export interface NotionPlanRow {
  /** Broker company name (Notion "Société"), used by the caller to match by slug. */
  societe: string;
  /** Parsed section code, e.g. "03.01". */
  code: string;
  status: SubstepStatus;
  /** Section deadline (ISO date) or null. */
  deadline: string | null;
  /** "Suivi" follow-up note or null. */
  suivi: string | null;
  /** Original "Actions" title, for the import report. */
  rawAction: string;
}

/** Diagnostics for rows that could not be turned into a NotionPlanRow. */
export interface NotionFetchReport {
  rows: NotionPlanRow[];
  /** Every broker company name present in Notion (for reset scoping). */
  brokers: string[];
  /** Rows whose "Actions" title had no parseable section code (e.g. "11 - Enquête AMLA"). */
  skippedNoCode: { societe: string | null; action: string }[];
  /** Rows with no resolvable broker relation. */
  skippedNoBroker: { action: string }[];
}

export interface NotionDataSources {
  planDataSourceId: string;
  clientsDataSourceId: string;
}

// --- property readers (tolerant to property names / missing values) ----------

function firstOfType(
  page: PageObjectResponse,
  type: string,
): PageObjectResponse['properties'][string] | undefined {
  return Object.values(page.properties).find((p) => p.type === type);
}

function titleText(page: PageObjectResponse): string {
  const prop = firstOfType(page, 'title');
  if (prop?.type !== 'title') return '';
  return prop.title.map((t) => t.plain_text).join('').trim();
}

function richText(page: PageObjectResponse, name: string): string | null {
  const prop = page.properties[name];
  if (prop?.type !== 'rich_text') return null;
  const text = prop.rich_text.map((t) => t.plain_text).join('').trim();
  return text || null;
}

function selectName(page: PageObjectResponse, name: string): string | null {
  const prop = page.properties[name];
  if (prop?.type !== 'select') return null;
  return prop.select?.name ?? null;
}

function dateStart(page: PageObjectResponse, name: string): string | null {
  const prop = page.properties[name];
  if (prop?.type !== 'date') return null;
  return prop.date?.start ?? null;
}

function relationIds(page: PageObjectResponse): string[] {
  const prop = firstOfType(page, 'relation');
  if (prop?.type !== 'relation') return [];
  return prop.relation.map((r) => r.id);
}

// --- fetchers ----------------------------------------------------------------

/** Build a map of broker page id → company name from the "Espace clients" source. */
export async function fetchClientNames(
  notion: Client,
  clientsDataSourceId: string,
): Promise<Map<string, string>> {
  const byId = new Map<string, string>();
  for await (const page of iteratePaginatedAPI(notion.dataSources.query, {
    data_source_id: clientsDataSourceId,
  })) {
    if (!isFullPage(page)) continue;
    const societe = titleText(page);
    if (societe) byId.set(page.id, societe);
  }
  return byId;
}

/**
 * Read every "Plan d'action" task, joined to its broker name, mapping the
 * section code + status. Section-level granularity (one task per section per
 * broker) — the caller broadcasts the status onto that section's sub-steps.
 */
export async function fetchNotionPlan(
  notion: Client,
  { planDataSourceId, clientsDataSourceId }: NotionDataSources,
): Promise<NotionFetchReport> {
  const clientNames = await fetchClientNames(notion, clientsDataSourceId);
  const report: NotionFetchReport = {
    rows: [],
    brokers: [...clientNames.values()],
    skippedNoCode: [],
    skippedNoBroker: [],
  };

  for await (const page of iteratePaginatedAPI(notion.dataSources.query, {
    data_source_id: planDataSourceId,
  })) {
    if (!isFullPage(page)) continue;
    const rawAction = titleText(page);
    const code = parseStepCode(rawAction);
    const brokerId = relationIds(page)[0];
    const societe = brokerId ? clientNames.get(brokerId) ?? null : null;

    if (!societe) {
      report.skippedNoBroker.push({ action: rawAction });
      continue;
    }
    if (!code) {
      report.skippedNoCode.push({ societe, action: rawAction });
      continue;
    }

    report.rows.push({
      societe,
      code,
      status: mapNotionStatus(selectName(page, 'Statut')),
      deadline: dateStart(page, 'Deadline'),
      suivi: richText(page, 'Suivi'),
      rawAction,
    });
  }

  return report;
}
