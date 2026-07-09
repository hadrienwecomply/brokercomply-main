/**
 * Extract a logo's brand palette with Anthropic vision.
 *
 * This mirrors the n8n Client-Enrichment "Build Palette Request" node
 * (`workflows/palette-request.js`): same model, same forced `palette_logo` tool,
 * same system prompt. The model only NAMES colours — the legibility guard-rail is
 * deterministic (see `theme.ts`). Never throws: returns null on any failure so
 * the caller can fall back to a hand-picked colour.
 */
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config/index.js';

/** Vision model — cheap and fast; palette naming needs no deep reasoning. */
const MODEL = 'claude-haiku-4-5';
const MAX_TOKENS = 300;

export interface LogoPalette {
  /** Dominant brand colour, `#rrggbb`. */
  primary: string;
  secondary?: string;
  tertiary?: string;
  backgroundHint?: 'transparent' | 'light' | 'dark';
  legibleOnDark: boolean;
}

const SYSTEM = [
  "Tu es un assistant d'identité visuelle. On te montre le logo d'une entreprise.",
  'Identifie les couleurs DE MARQUE du logo, pas celles du fond.',
  'Règles :',
  '- Ignore le blanc, le noir pur d\'encrage de texte, les gris neutres et les fonds (transparents ou unis).',
  '- primary_hex = la couleur dominante de la marque (la plus représentative du logo).',
  '- secondary_hex / tertiary_hex = les couleurs de marque suivantes si elles existent, sinon omets-les.',
  '- Pour un dégradé, choisis la teinte médiane du dégradé comme couleur.',
  '- legible_on_dark : imagine le logo posé sur un fond très sombre. true seulement si TOUS ses éléments (texte inclus, même blanc actuellement invisible sur fond clair) resteraient lisibles.',
  '- Réponds EXCLUSIVEMENT via l\'outil `palette_logo`, en hex 6 caractères (#rrggbb).',
].join('\n');

const TOOL: Anthropic.Tool = {
  name: 'palette_logo',
  description: 'Palette de marque extraite du logo.',
  input_schema: {
    type: 'object',
    properties: {
      primary_hex: { type: 'string', description: 'Couleur dominante de la marque, format #rrggbb.' },
      secondary_hex: { type: 'string', description: 'Deuxième couleur de marque (#rrggbb), si présente.' },
      tertiary_hex: { type: 'string', description: 'Troisième couleur de marque (#rrggbb), si présente.' },
      background_hint: {
        type: 'string',
        enum: ['transparent', 'light', 'dark'],
        description: 'Nature du fond du logo.',
      },
      legible_on_dark: {
        type: 'boolean',
        description:
          'true si le logo posé tel quel sur un fond SOMBRE reste entièrement lisible.',
      },
    },
    required: ['primary_hex', 'background_hint', 'legible_on_dark'],
  },
};

const normHex = (x: unknown): string | null => {
  const m = String(x ?? '')
    .trim()
    .match(/^#?([0-9a-f]{6})$/i);
  return m ? `#${m[1]!.toLowerCase()}` : null;
};

/**
 * Extract the brand palette from a `data:image/...;base64,...` logo URI. Only
 * raster formats vision accepts (png/jpeg/webp/gif) are supported; anything else
 * (or no API key, or an API/parse error) yields null.
 */
export async function extractLogoPalette(dataUri: string): Promise<LogoPalette | null> {
  const apiKey = config.ANTHROPIC_API_KEY ?? config.LLM_API_KEY;
  if (!apiKey) return null;

  const m = String(dataUri).match(/^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/);
  if (!m) return null;
  const mediaType = m[1] as 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
  const base64Data = m[2]!;

  try {
    const client = new Anthropic({ apiKey });
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      temperature: 0,
      system: SYSTEM,
      tools: [TOOL],
      tool_choice: { type: 'tool', name: 'palette_logo' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
            { type: 'text', text: "Extrais la palette de marque de ce logo via l'outil `palette_logo`." },
          ],
        },
      ],
    });

    const block = res.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === 'palette_logo',
    );
    const input = block?.input as Record<string, unknown> | undefined;
    if (!input) return null;

    const primary = normHex(input.primary_hex);
    if (!primary) return null;
    const hint = input.background_hint;
    return {
      primary,
      secondary: normHex(input.secondary_hex) ?? undefined,
      tertiary: normHex(input.tertiary_hex) ?? undefined,
      backgroundHint:
        hint === 'transparent' || hint === 'light' || hint === 'dark' ? hint : undefined,
      legibleOnDark: input.legible_on_dark === true,
    };
  } catch {
    return null;
  }
}
