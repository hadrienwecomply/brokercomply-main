import "server-only";
import { z } from "zod";
import { tool, type SdkMcpToolDefinition } from "@anthropic-ai/claude-agent-sdk";
import {
  createLLMClient,
  getKnowledgeUnit,
  searchSemantic,
  type SearchResult,
} from "@brokercomply/shared";
import { getDb } from "../db.server";
import { getBroker, listBrokers } from "../brokers.server";
import { getSentEmails } from "../mail.server";
import { listWebsiteAudits } from "../website-audit.server";
import { listPubAudits } from "../pub-audit.server";

/** Shape a successful tool result as JSON text the agent can read. */
function ok(data: unknown): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

/** Shape a tool error so the agent can recover instead of throwing. */
function fail(message: string): {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
} {
  return { content: [{ type: "text", text: message }], isError: true };
}

/** Resolve a broker by slug; throws a readable error when unknown or unpersisted. */
async function resolveBroker(slug: string) {
  const broker = await getBroker(slug);
  if (!broker) throw new Error(`Aucun courtier avec le slug "${slug}".`);
  if (!broker.dbId) throw new Error(`Le courtier "${slug}" n'est pas encore persisté.`);
  return broker as typeof broker & { dbId: string };
}

function compactSearchHit(r: SearchResult) {
  const u = r.unit;
  return {
    id: u.id,
    question: u.question,
    answer: u.answer.length > 600 ? `${u.answer.slice(0, 600)}…` : u.answer,
    topic: u.topic,
    author: u.author,
    sourceDate: u.sourceDate,
    regulatoryRefs: u.regulatoryRefs ?? [],
    confidence: u.confidence,
    score: Number(r.score.toFixed(4)),
  };
}

const kbSearch = tool(
  "kb_search",
  "Recherche hybride (sémantique + lexicale) dans la base de connaissances de conformité " +
    "(questions/réponses distillées des échanges des compliance officers). À utiliser pour " +
    "répondre à toute question réglementaire FSMA/assurance/crédit. Retourne des unités avec " +
    "leur id (à citer), question, réponse, références réglementaires, auteur et date source.",
  {
    query: z.string().describe("La question ou les mots-clés à rechercher."),
    limit: z.number().int().min(1).max(20).optional().describe("Nombre de résultats (défaut 8)."),
    topic: z.string().optional().describe("Filtrer sur un thème précis."),
    language: z.string().optional().describe("Filtrer sur une langue (fr, nl, en)."),
  },
  async (args) => {
    try {
      const llm = createLLMClient();
      const results = await searchSemantic({ db: getDb(), llm }, args.query, {
        limit: args.limit ?? 8,
        topic: args.topic as never,
        language: args.language as never,
        onlyPublished: false,
      });
      return ok({ count: results.length, results: results.map(compactSearchHit) });
    } catch (e) {
      return fail(`Échec de la recherche: ${(e as Error).message}`);
    }
  },
  { alwaysLoad: true },
);

const kbGetUnit = tool(
  "kb_get_unit",
  "Récupère une unité de connaissance complète par son id, avec les emails sources dont elle " +
    "est issue (pour citer la provenance : sujet, expéditeur, date).",
  { id: z.string().describe("L'id de l'unité de connaissance.") },
  async (args) => {
    try {
      const detail = await getKnowledgeUnit({ db: getDb() }, args.id);
      if (!detail) return fail(`Aucune unité avec l'id "${args.id}".`);
      return ok({
        unit: {
          id: detail.unit.id,
          question: detail.unit.question,
          answer: detail.unit.answer,
          topic: detail.unit.topic,
          author: detail.unit.author,
          language: detail.unit.language,
          sourceDate: detail.unit.sourceDate,
          regulatoryRefs: detail.unit.regulatoryRefs ?? [],
          confidence: detail.unit.confidence,
          isPublished: detail.unit.isPublished,
        },
        sources: detail.sources.map((s) => ({
          id: s.id,
          subject: s.subject,
          sender: s.sender,
          receivedAt: s.receivedAt ? new Date(s.receivedAt).toISOString() : null,
          direction: s.direction,
        })),
      });
    } catch (e) {
      return fail(`Échec de la lecture: ${(e as Error).message}`);
    }
  },
  { alwaysLoad: true },
);

const brokerList = tool(
  "broker_list",
  "Liste les courtiers du portefeuille (CRM). Filtre optionnel par nom de société ou contact. " +
    "Retourne pour chacun : slug (identifiant à réutiliser dans les autres outils), société, " +
    "contact, statut, officer assigné, produit et site web.",
  {
    query: z.string().optional().describe("Filtre insensible à la casse sur la société/contact."),
  },
  async (args) => {
    try {
      const all = await listBrokers();
      const q = args.query?.trim().toLowerCase();
      const filtered = q
        ? all.filter(
            (b) =>
              b.societe.toLowerCase().includes(q) || (b.contact ?? "").toLowerCase().includes(q),
          )
        : all;
      return ok({
        count: filtered.length,
        brokers: filtered.map((b) => ({
          slug: b.id,
          societe: b.societe,
          contact: b.contact,
          status: b.status,
          officer: b.officerId,
          product: b.product,
          website: b.website,
          country: b.countries?.[0] ?? null,
        })),
      });
    } catch (e) {
      return fail(`Échec de la liste: ${(e as Error).message}`);
    }
  },
  { alwaysLoad: true },
);

const brokerGet = tool(
  "broker_get",
  "Fiche détaillée d'un courtier par son slug : coordonnées, statut, et l'avancement de son " +
    "plan d'action de conformité (13 étapes, avec le statut de chaque sous-étape).",
  { slug: z.string().describe("Le slug du courtier (voir broker_list).") },
  async (args) => {
    try {
      const b = await resolveBroker(args.slug);
      return ok({
        slug: b.id,
        societe: b.societe,
        contact: b.contact,
        emails: b.emails,
        officer: b.officerId,
        status: b.status,
        product: b.product,
        website: b.website,
        fsmaNumber: b.fsmaNumber,
        signatureDate: b.signatureDate,
        plan: b.plan.map((step) => ({
          code: step.code,
          title: step.title,
          deadline: step.deadline ?? null,
          substeps: step.subSteps.map((s) => ({
            title: s.title,
            status: s.status,
            dueDate: s.dueDate ?? null,
          })),
        })),
      });
    } catch (e) {
      return fail((e as Error).message);
    }
  },
  { alwaysLoad: true },
);

const brokerSentEmails = tool(
  "broker_sent_emails",
  "Historique des emails de modèle (plan d'action) envoyés à un courtier depuis le dashboard : " +
    "sujet, destinataires, officer expéditeur et date d'envoi.",
  { slug: z.string().describe("Le slug du courtier.") },
  async (args) => {
    try {
      const b = await resolveBroker(args.slug);
      const emails = await getSentEmails(b.dbId);
      return ok({ count: emails.length, emails });
    } catch (e) {
      return fail((e as Error).message);
    }
  },
  { alwaysLoad: true },
);

const websiteAuditList = tool(
  "website_audit_list",
  "Liste les audits de conformité du site web d'un courtier (statut, date, score/niveau). " +
    "Lecture seule — ne lance pas de nouvel audit.",
  { slug: z.string().describe("Le slug du courtier.") },
  async (args) => {
    try {
      const b = await resolveBroker(args.slug);
      const audits = await listWebsiteAudits(b.dbId);
      return ok({ count: audits.length, audits });
    } catch (e) {
      return fail((e as Error).message);
    }
  },
  { alwaysLoad: true },
);

const pubAuditList = tool(
  "pub_audit_list",
  "Liste les audits de conformité des publicités (images) d'un courtier (statut, fichier, date). " +
    "Lecture seule — ne lance pas de nouvel audit.",
  { slug: z.string().describe("Le slug du courtier.") },
  async (args) => {
    try {
      const b = await resolveBroker(args.slug);
      const audits = await listPubAudits(b.dbId);
      return ok({ count: audits.length, audits });
    } catch (e) {
      return fail((e as Error).message);
    }
  },
  { alwaysLoad: true },
);

/** All read-only tools registered for Phase 1. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const READ_ONLY_TOOLS: SdkMcpToolDefinition<any>[] = [
  kbSearch,
  kbGetUnit,
  brokerList,
  brokerGet,
  brokerSentEmails,
  websiteAuditList,
  pubAuditList,
];

/** MCP server name — tools are addressed as `mcp__<SERVER_NAME>__<tool>`. */
export const AGENT_MCP_SERVER = "brokercomply";

/** Fully-qualified tool names for the `allowedTools` whitelist. */
export const READ_ONLY_TOOL_NAMES = [
  "kb_search",
  "kb_get_unit",
  "broker_list",
  "broker_get",
  "broker_sent_emails",
  "website_audit_list",
  "pub_audit_list",
].map((n) => `mcp__${AGENT_MCP_SERVER}__${n}`);
