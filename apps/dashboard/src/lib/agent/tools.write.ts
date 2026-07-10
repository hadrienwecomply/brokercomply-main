import "server-only";
import { z } from "zod";
import { tool, type SdkMcpToolDefinition } from "@anthropic-ai/claude-agent-sdk";
import type { KnowledgeUpdate, SubstepContentPatch } from "@brokercomply/shared";
import {
  changeSubstepStatus,
  createSubstep,
  deleteSubstep,
  editSubstep,
  overrideStepDeadline,
  patchBroker,
  type UpdateBrokerPatch,
} from "../brokers.server";
import { updateUnit } from "../knowledge.server";
import { fail, ok, qualify, resolveBroker, type ToolContext } from "./tool-kit";

/**
 * Reversible write tools. Every mutation is a plan/CRM/KB edit that can be undone
 * by another edit (status flip, re-edit, un-archive by re-creating). No email is
 * sent and no external/costly job is launched here — those live in
 * `tools.actions.ts` and are confirmation-gated.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildWriteTools(ctx: ToolContext): SdkMcpToolDefinition<any>[] {
  const planSetSubstepStatus = tool(
    "plan_set_substep_status",
    "Change le statut d'une sous-étape (tâche) du plan d'action d'un courtier. Écriture " +
      "réversible (le statut peut être remis à tout moment). Utilise l'identifiant de sous-étape " +
      "(substepId) renvoyé par broker_get.",
    {
      slug: z.string().describe("Le slug du courtier (voir broker_list)."),
      substepId: z.string().describe("L'identifiant persisté de la sous-étape (voir broker_get)."),
      status: z
        .enum(["not_started", "in_progress", "waiting_client", "blocked", "done"])
        .describe("Le nouveau statut de la sous-étape."),
      notes: z.string().optional().describe("Note interne facultative attachée au changement."),
    },
    async (args) => {
      try {
        await changeSubstepStatus(args.slug, args.substepId, args.status, args.notes);
        return ok({ updated: true, substepId: args.substepId, status: args.status });
      } catch (e) {
        return fail((e as Error).message);
      }
    },
    { alwaysLoad: true },
  );

  const planSetStepDeadline = tool(
    "plan_set_step_deadline",
    "Fixe (ou efface) l'échéance manuelle d'une étape (section) du plan d'action. Écriture " +
      "réversible. Passe une date YYYY-MM-DD, ou null pour retirer l'échéance manuelle et " +
      "revenir à l'échéance calculée depuis la date de signature.",
    {
      slug: z.string().describe("Le slug du courtier."),
      stepId: z.string().describe("L'identifiant persisté de l'étape (stepId de broker_get)."),
      deadline: z
        .string()
        .nullable()
        .describe("Échéance au format YYYY-MM-DD, ou null pour effacer l'échéance manuelle."),
    },
    async (args) => {
      try {
        await overrideStepDeadline(args.slug, args.stepId, args.deadline);
        return ok({ updated: true, stepId: args.stepId, deadline: args.deadline });
      } catch (e) {
        return fail((e as Error).message);
      }
    },
    { alwaysLoad: true },
  );

  const planAddSubstep = tool(
    "plan_add_substep",
    "Ajoute une nouvelle sous-étape (tâche) sur mesure à une étape du plan d'action d'un " +
      "courtier. Écriture réversible (elle peut être archivée ensuite). La tâche peut porter un " +
      "modèle d'e-mail (objet + corps) réutilisé par send_step_email.",
    {
      slug: z.string().describe("Le slug du courtier."),
      stepId: z.string().describe("L'identifiant persisté de l'étape parente (stepId de broker_get)."),
      title: z.string().describe("Le libellé de la nouvelle tâche."),
      dueDate: z
        .string()
        .nullable()
        .optional()
        .describe("Échéance de la tâche au format YYYY-MM-DD (facultative)."),
      emailSubject: z.string().nullable().optional().describe("Objet du modèle d'e-mail (facultatif)."),
      emailBody: z.string().nullable().optional().describe("Corps du modèle d'e-mail (facultatif)."),
    },
    async (args) => {
      try {
        const fields: SubstepContentPatch = {
          title: args.title,
          dueDate: args.dueDate,
          emailSubject: args.emailSubject,
          emailBody: args.emailBody,
        };
        await createSubstep(args.slug, args.stepId, fields);
        return ok({ created: true, stepId: args.stepId, title: args.title });
      } catch (e) {
        return fail((e as Error).message);
      }
    },
    { alwaysLoad: true },
  );

  const planEditSubstep = tool(
    "plan_edit_substep",
    "Modifie le contenu d'une sous-étape existante (libellé, échéance de tâche, modèle d'e-mail). " +
      "Écriture réversible. N'affecte pas le statut (voir plan_set_substep_status).",
    {
      slug: z.string().describe("Le slug du courtier."),
      substepId: z.string().describe("L'identifiant persisté de la sous-étape (voir broker_get)."),
      title: z.string().optional().describe("Nouveau libellé de la tâche."),
      dueDate: z
        .string()
        .nullable()
        .optional()
        .describe("Nouvelle échéance YYYY-MM-DD, ou null pour l'effacer."),
      emailSubject: z.string().nullable().optional().describe("Nouvel objet du modèle d'e-mail."),
      emailBody: z.string().nullable().optional().describe("Nouveau corps du modèle d'e-mail."),
    },
    async (args) => {
      try {
        const patch: SubstepContentPatch = {};
        if (args.title !== undefined) patch.title = args.title;
        if (args.dueDate !== undefined) patch.dueDate = args.dueDate;
        if (args.emailSubject !== undefined) patch.emailSubject = args.emailSubject;
        if (args.emailBody !== undefined) patch.emailBody = args.emailBody;
        await editSubstep(args.slug, args.substepId, patch);
        return ok({ updated: true, substepId: args.substepId });
      } catch (e) {
        return fail((e as Error).message);
      }
    },
    { alwaysLoad: true },
  );

  const planArchiveSubstep = tool(
    "plan_archive_substep",
    "Archive (retire) une sous-étape du plan d'action d'un courtier. Réversible côté données " +
      "(archivage logique, pas une suppression définitive).",
    {
      slug: z.string().describe("Le slug du courtier."),
      substepId: z.string().describe("L'identifiant persisté de la sous-étape (voir broker_get)."),
    },
    async (args) => {
      try {
        await deleteSubstep(args.slug, args.substepId);
        return ok({ archived: true, substepId: args.substepId });
      } catch (e) {
        return fail((e as Error).message);
      }
    },
    { alwaysLoad: true },
  );

  const brokerUpdate = tool(
    "broker_update",
    "Met à jour les coordonnées de la fiche d'un courtier (contact, téléphone, site web, statut, " +
      "langue). Écriture réversible. Ne touche pas à la société, aux e-mails ni au MRR.",
    {
      slug: z.string().describe("Le slug du courtier."),
      contact: z.string().nullable().optional().describe("Nom du contact principal."),
      phone: z.string().nullable().optional().describe("Numéro de téléphone."),
      website: z.string().nullable().optional().describe("URL du site web."),
      status: z.string().nullable().optional().describe("Statut du courtier (ex. onboarding, actif)."),
      language: z.string().nullable().optional().describe("Langue de correspondance (fr, nl, en)."),
    },
    async (args) => {
      try {
        const broker = await resolveBroker(args.slug);
        const patch: UpdateBrokerPatch = {};
        if (args.contact !== undefined) patch.contact = args.contact;
        if (args.phone !== undefined) patch.phone = args.phone;
        if (args.website !== undefined) patch.website = args.website;
        if (args.status !== undefined) patch.status = args.status;
        if (args.language !== undefined) patch.language = args.language;
        await patchBroker(broker.dbId, patch);
        return ok({ updated: true, slug: args.slug });
      } catch (e) {
        return fail((e as Error).message);
      }
    },
    { alwaysLoad: true },
  );

  const kbUpdateUnit = tool(
    "kb_update_unit",
    "Modifie une unité de connaissance existante (question, réponse, thème, références " +
      "réglementaires, langue, date source, publication). Écriture réversible. L'officer courant " +
      "est enregistré comme auteur de la modification.",
    {
      id: z.string().describe("L'id de l'unité de connaissance (voir kb_search / kb_get_unit)."),
      question: z.string().optional().describe("Nouvelle formulation de la question."),
      answer: z.string().optional().describe("Nouvelle réponse."),
      topic: z.string().nullable().optional().describe("Thème, ou null pour l'effacer."),
      regulatoryRefs: z
        .array(z.string())
        .nullable()
        .optional()
        .describe("Références réglementaires, ou null pour les effacer."),
      language: z.string().nullable().optional().describe("Langue (fr, nl, en), ou null."),
      sourceDate: z
        .string()
        .nullable()
        .optional()
        .describe("Date source au format YYYY-MM-DD, ou null."),
      isPublished: z.boolean().optional().describe("Publier (true) ou dépublier (false) l'unité."),
    },
    async (args) => {
      try {
        const patch: KnowledgeUpdate = {};
        if (args.question !== undefined) patch.question = args.question;
        if (args.answer !== undefined) patch.answer = args.answer;
        if (args.topic !== undefined) patch.topic = args.topic as KnowledgeUpdate["topic"];
        if (args.regulatoryRefs !== undefined) patch.regulatoryRefs = args.regulatoryRefs;
        if (args.language !== undefined) patch.language = args.language as KnowledgeUpdate["language"];
        if (args.sourceDate !== undefined) patch.sourceDate = args.sourceDate;
        if (args.isPublished !== undefined) patch.isPublished = args.isPublished;
        const updated = await updateUnit(args.id, patch, ctx.officer);
        if (!updated) return fail(`Aucune unité avec l'id "${args.id}".`);
        return ok({ updated: true, id: updated.id, isPublished: updated.isPublished });
      } catch (e) {
        return fail((e as Error).message);
      }
    },
    { alwaysLoad: true },
  );

  return [
    planSetSubstepStatus,
    planSetStepDeadline,
    planAddSubstep,
    planEditSubstep,
    planArchiveSubstep,
    brokerUpdate,
    kbUpdateUnit,
  ];
}

/** Fully-qualified write tool names for the `allowedTools` whitelist. */
export const WRITE_TOOL_NAMES: string[] = [
  "plan_set_substep_status",
  "plan_set_step_deadline",
  "plan_add_substep",
  "plan_edit_substep",
  "plan_archive_substep",
  "broker_update",
  "kb_update_unit",
].map(qualify);
