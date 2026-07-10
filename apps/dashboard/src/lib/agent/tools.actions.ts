import "server-only";
import { z } from "zod";
import { tool, type SdkMcpToolDefinition } from "@anthropic-ai/claude-agent-sdk";
import { buildEmailDraft } from "../email-draft";
import { sendStepEmail } from "../mail.server";
import { requestWebsiteAuditPdf, startWebsiteAudit } from "../website-audit.server";
import { requestPubAuditPdf, startPubAuditsFromUpload } from "../pub-audit.server";
import { fail, ok, qualify, resolveBroker, type ToolContext } from "./tool-kit";

/**
 * Irreversible / costly tools. Each one either sends a real e-mail, launches a
 * billed vision analysis, or fires an n8n workflow. They are ALL confirmation-
 * gated (see CONFIRM_TOOL_NAMES): the runner must obtain an explicit go-ahead
 * before executing them.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildActionTools(ctx: ToolContext): SdkMcpToolDefinition<any>[] {
  const sendStepEmailTool = tool(
    "send_step_email",
    "ATTENTION : envoie RÉELLEMENT un e-mail de modèle (plan d'action) au courtier depuis la " +
      "boîte de son officer assigné, via Microsoft Graph. Action IRRÉVERSIBLE. L'objet, le corps " +
      "et les destinataires sont pré-remplis depuis le modèle de la sous-étape ; ils peuvent être " +
      "surchargés via les paramètres. Utilise l'identifiant de sous-étape renvoyé par broker_get.",
    {
      slug: z.string().describe("Le slug du courtier."),
      substepId: z.string().describe("L'identifiant persisté de la sous-étape portant le modèle d'e-mail."),
      to: z.array(z.string()).optional().describe("Destinataires (par défaut : e-mail du courtier)."),
      cc: z.array(z.string()).optional().describe("Copie carbone (par défaut : aucune)."),
      subject: z.string().optional().describe("Objet (par défaut : objet rendu du modèle)."),
      body: z.string().optional().describe("Corps (par défaut : corps rendu du modèle)."),
    },
    async (args) => {
      try {
        const broker = await resolveBroker(args.slug);
        const step = broker.plan.find((s) =>
          s.subSteps.some((sub) => sub.dbId === args.substepId || sub.id === args.substepId),
        );
        const substep = step?.subSteps.find(
          (sub) => sub.dbId === args.substepId || sub.id === args.substepId,
        );
        if (!step || !substep) return fail(`Aucune sous-étape "${args.substepId}" pour ce courtier.`);

        const draft = buildEmailDraft(broker, step, substep);
        const to = args.to ?? draft.to;
        const cc = args.cc ?? draft.cc;
        const subject = args.subject ?? draft.subject;
        const body = args.body ?? draft.body;

        await sendStepEmail({
          slug: args.slug,
          stepCode: step.code,
          substepTemplateId: substep.id,
          to,
          cc,
          subject,
          body,
          officer: ctx.officer,
        });
        return ok({ sent: true, slug: args.slug, substepId: args.substepId, to, subject });
      } catch (e) {
        return fail((e as Error).message);
      }
    },
    { alwaysLoad: true },
  );

  const websiteAuditStart = tool(
    "website_audit_start",
    "ATTENTION : lance une analyse de conformité FACTURÉE du site web du courtier (scraping + " +
      "analyse vision par LLM). Action coûteuse et non annulable une fois lancée. L'analyse tourne " +
      "en arrière-plan : le résultat est asynchrone (statut à suivre via website_audit_list).",
    { slug: z.string().describe("Le slug du courtier (son site web doit être renseigné).") },
    async (args) => {
      try {
        const result = await startWebsiteAudit(args.slug);
        if (!result.ok) return fail(result.error ?? "Échec du lancement de l'audit.");
        return ok({ started: true, auditId: result.auditId, async: true });
      } catch (e) {
        return fail((e as Error).message);
      }
    },
    { alwaysLoad: true },
  );

  const websiteAuditRequestPdf = tool(
    "website_audit_request_pdf",
    "ATTENTION : déclenche le workflow n8n de génération du PDF branded d'un audit de site web. " +
      "Action réelle (appel externe) : le PDF est produit de façon asynchrone et renvoyé plus " +
      "tard par callback — la réponse indique seulement « déclenché, résultat asynchrone ».",
    {
      auditId: z.string().describe("L'id de l'audit de site web (voir website_audit_list)."),
      edits: z.unknown().optional().describe("Modifications éditoriales à réinjecter dans le rapport (facultatif)."),
    },
    async (args) => {
      try {
        const result = await requestWebsiteAuditPdf(args.auditId, args.edits ?? null);
        if (!result.ok) return fail(result.error ?? "Échec du déclenchement de la génération PDF.");
        return ok({ triggered: true, auditId: args.auditId, async: true });
      } catch (e) {
        return fail((e as Error).message);
      }
    },
    { alwaysLoad: true },
  );

  const pubAuditRequestPdf = tool(
    "pub_audit_request_pdf",
    "ATTENTION : déclenche le workflow n8n de génération du PDF branded d'un audit de publicité. " +
      "Action réelle (appel externe) : le PDF est produit de façon asynchrone et renvoyé plus " +
      "tard par callback — la réponse indique seulement « déclenché, résultat asynchrone ».",
    {
      auditId: z.string().describe("L'id de l'audit de publicité (voir pub_audit_list)."),
      edits: z.unknown().optional().describe("Modifications éditoriales à réinjecter dans le rapport (facultatif)."),
    },
    async (args) => {
      try {
        const result = await requestPubAuditPdf(args.auditId, args.edits ?? null);
        if (!result.ok) return fail(result.error ?? "Échec du déclenchement de la génération PDF.");
        return ok({ triggered: true, auditId: args.auditId, async: true });
      } catch (e) {
        return fail((e as Error).message);
      }
    },
    { alwaysLoad: true },
  );

  const pubAuditStart = tool(
    "pub_audit_start",
    "ATTENTION : lance une analyse de conformité FACTURÉE des publicités (images) du courtier, " +
      "à partir des images JOINTES à ce message. Action coûteuse et non annulable (jusqu'à 4 " +
      "appels vision par image). N'utilise cet outil QUE si l'officer a joint au moins une image. " +
      "L'analyse tourne en arrière-plan : le résultat est asynchrone (suivi via pub_audit_list).",
    { slug: z.string().describe("Le slug du courtier auquel rattacher les audits.") },
    async (args) => {
      try {
        const images = ctx.images ?? [];
        if (images.length === 0) {
          return fail("Aucune image n'est jointe à ce message. Demande à l'officer d'en joindre.");
        }
        const result = await startPubAuditsFromUpload(args.slug, images);
        if (!result.ok) return fail(result.error ?? "Échec du lancement de l'audit pub.");
        return ok({
          started: true,
          count: result.auditIds?.length ?? 0,
          batchId: result.batchId,
          async: true,
        });
      } catch (e) {
        return fail((e as Error).message);
      }
    },
    { alwaysLoad: true },
  );

  return [
    sendStepEmailTool,
    websiteAuditStart,
    websiteAuditRequestPdf,
    pubAuditRequestPdf,
    pubAuditStart,
  ];
}

/** Fully-qualified action tool names for the `allowedTools` whitelist. */
export const ACTION_TOOL_NAMES: string[] = [
  "send_step_email",
  "website_audit_start",
  "website_audit_request_pdf",
  "pub_audit_request_pdf",
  "pub_audit_start",
].map(qualify);

/** Every action tool requires explicit confirmation before the runner executes it. */
export const CONFIRM_TOOL_NAMES: Set<string> = new Set(ACTION_TOOL_NAMES);

// n8n_trigger_form: SKIPPED. The only broker-facing n8n entry point in the app is
// `retryTrigger(slug, submissionId)` (formulaire-actions.ts), which RE-fires the
// workflow for an already-existing Fillout submission — it needs a pre-existing
// submissionId, not a broker. There is no clean single "trigger a form workflow
// for a broker" function to wrap (buildN8nPayload/triggerN8nWorkflow in
// packages/shared/src/integrations/n8n.ts are low-level primitives requiring many
// unclear params). Adding a tool here would mean inventing parameters, so it is
// intentionally omitted.
