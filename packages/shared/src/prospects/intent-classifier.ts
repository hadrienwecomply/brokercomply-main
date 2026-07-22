/**
 * The LLM half of the intent detection: read a prospect's e-mail thread and
 * decide the CURRENT state of the conversation — one of seven intents, a
 * confidence, and the verbatim sentence that justifies it.
 *
 * Deliberately thin and side-effect-free: it takes an {@link LLMClient} (so
 * tests inject a fake and no network is touched) and returns a plain result.
 * The deterministic consequences — which funnel move, which confidence bar —
 * live in `intent-mapping.ts`; the writing and guard-rails live in the bridge
 * (`intent-bridge.ts`). This split keeps the risky, non-deterministic step
 * small and everything around it testable.
 *
 * Model: Sonnet 5 (decision — the task closes real deals, so we favour accuracy
 * over the cheaper tier; cost optimisation, if ever needed, comes later).
 */

import type { LLMClient } from '../llm/types.js';
import { PROSPECT_INTENTS, type ProspectIntent } from './intent-mapping.js';

export const CLASSIFIER_MODEL = 'claude-sonnet-5';

export interface IntentClassification {
  intent: ProspectIntent;
  /** 0..1 — compared against the per-move-type thresholds by the bridge. */
  confidence: number;
  /** Verbatim excerpt justifying the intent (audit trail), or null. */
  quote: string | null;
  /**
   * ISO date the prospect referenced, when relevant: the requested call-back
   * date for `later`, or the agreed meeting date for `meeting_booked`. Null
   * when none was stated. Best-effort — the bridge falls back to a default.
   */
  suggestedDate: string | null;
}

/** Minimal context the classifier needs beyond the thread text. */
export interface IntentClassifierInput {
  /** Cleaned thread text, oldest → newest (signatures/quotes already stripped). */
  threadText: string;
  /** Agency name, to ground the model on who is speaking. */
  societe: string;
  /** Whether a commercial offer had already been sent (disambiguates replies). */
  offerAlreadySent: boolean;
  /** Today, for resolving relative dates ("en septembre", "la semaine pro"). */
  today: Date;
}

/** Thrown when the model returns something we cannot safely interpret. */
export class IntentParseError extends Error {
  constructor(
    message: string,
    readonly raw: string,
  ) {
    super(message);
    this.name = 'IntentParseError';
  }
}

const SYSTEM_PROMPT = `Tu es un assistant commercial qui lit un fil d'e-mails entre un courtier prospect et notre équipe, et qui détermine l'ÉTAT ACTUEL de la conversation du point de vue du prospect.

Tu renvoies UNIQUEMENT un objet JSON, sans texte autour, avec ce schéma exact :
{
  "intent": un de ["no_reply","interested","not_interested","later","meeting_booked","unreachable","converted"],
  "confidence": nombre entre 0 et 1,
  "quote": la phrase VERBATIM du prospect qui justifie l'intent (ou null),
  "suggestedDate": date ISO "YYYY-MM-DD" mentionnée par le prospect (rappel pour "later", RDV pour "meeting_booked"), sinon null
}

Définitions des intents (choisis l'état COURANT, en tenant compte de tout le fil — le dernier message du prospect prime) :
- "no_reply" : le prospect n'a rien répondu de significatif (réponse automatique, absence du bureau, accusé de réception vide).
- "interested" : il manifeste de l'intérêt, pose des questions, veut en savoir plus. Positif mais sans RDV encore fixé.
- "not_interested" : il décline, dit ne pas être intéressé, demande de ne plus être contacté.
- "later" : intéressé mais pas maintenant — demande à être recontacté plus tard (souvent avec une échéance).
- "meeting_booked" : il accepte ou confirme un rendez-vous / une démo.
- "unreachable" : mauvais contact, personne partie, adresse invalide, "ne travaille plus ici".
- "converted" : il a signé / est devenu client.

Règles :
- La "quote" doit être une citation EXACTE tirée d'un message DU PROSPECT, jamais de notre équipe. Si rien de citable, mets null et baisse la confidence.
- "confidence" reflète ta certitude réelle. Un fil ambigu ou un seul mot ("ok") mérite une confidence basse.
- Ne devine pas : dans le doute entre deux intents, choisis le plus prudent (pas de fermeture de deal sans signal net) et baisse la confidence.`;

/** Parse and validate the model's JSON reply into a typed classification. */
export function parseClassification(raw: string): IntentClassification {
  // Tolerate ```json fences or stray prose around the object.
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new IntentParseError('no JSON object in model reply', raw);
  }
  let obj: unknown;
  try {
    obj = JSON.parse(raw.slice(start, end + 1));
  } catch {
    throw new IntentParseError('model reply is not valid JSON', raw);
  }
  const o = obj as Record<string, unknown>;

  const intent = o.intent;
  if (typeof intent !== 'string' || !PROSPECT_INTENTS.includes(intent as ProspectIntent)) {
    throw new IntentParseError(`unknown intent "${String(intent)}"`, raw);
  }
  const rawConfidence = typeof o.confidence === 'number' ? o.confidence : Number(o.confidence);
  if (!Number.isFinite(rawConfidence)) {
    throw new IntentParseError('confidence is not a number', raw);
  }
  // Clamp defensively — never trust the model to stay in [0,1].
  const confidence = Math.min(1, Math.max(0, rawConfidence));

  const quote = typeof o.quote === 'string' && o.quote.trim() ? o.quote.trim() : null;
  const suggestedDate =
    typeof o.suggestedDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(o.suggestedDate)
      ? o.suggestedDate.slice(0, 10)
      : null;

  return { intent: intent as ProspectIntent, confidence, quote, suggestedDate };
}

/** Classify one thread. Throws {@link IntentParseError} on unusable output. */
export async function classifyIntent(
  llm: LLMClient,
  input: IntentClassifierInput,
): Promise<IntentClassification> {
  const userMessage = [
    `Prospect : ${input.societe}`,
    `Offre commerciale déjà envoyée : ${input.offerAlreadySent ? 'oui' : 'non'}`,
    `Date du jour : ${input.today.toISOString().slice(0, 10)}`,
    '',
    'Fil d\'e-mails (du plus ancien au plus récent) :',
    input.threadText.trim(),
  ].join('\n');

  const reply = await llm.chat([{ role: 'user', content: userMessage }], {
    system: SYSTEM_PROMPT,
    model: CLASSIFIER_MODEL,
    // No temperature: Sonnet 5 rejects the parameter (it is deterministic-leaning
    // by default). The shared client omits it when unset.
    maxTokens: 512,
  });
  return parseClassification(reply);
}
