import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { config, type Config } from '../config/index.js';
import type { ChatMessage, ChatOptions, LLMClient } from './types.js';

/** Max texts per OpenAI embeddings request (well under the API limit). */
const EMBED_BATCH_SIZE = 100;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Retry transient API errors (429 / 5xx) with exponential backoff + jitter. */
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 4): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (error) {
      const status = (error as { status?: number }).status;
      const retryable = status === 429 || (status !== undefined && status >= 500);
      if (!retryable || attempt >= maxRetries) throw error;
      const backoff = 2 ** attempt * 500;
      await sleep(backoff + Math.floor(backoff * 0.25 * Math.random()));
      attempt += 1;
    }
  }
}

interface ChatProvider {
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<string>;
}

/** Image media types the Anthropic vision API accepts. */
const SUPPORTED_IMAGE_MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
type SupportedImageMediaType = (typeof SUPPORTED_IMAGE_MEDIA_TYPES)[number];

/** Narrow a media type to the supported union, or throw a clear error. */
function assertImageMediaType(mediaType: string): SupportedImageMediaType {
  if ((SUPPORTED_IMAGE_MEDIA_TYPES as readonly string[]).includes(mediaType)) {
    return mediaType as SupportedImageMediaType;
  }
  throw new Error(
    `Unsupported image media type "${mediaType}" (expected one of ${SUPPORTED_IMAGE_MEDIA_TYPES.join(', ')}).`,
  );
}

class AnthropicChatProvider implements ChatProvider {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<string> {
    const images = options.images ?? [];
    // Attach images (if any) to the last user message as image blocks.
    const lastUserIdx = images.length > 0 ? findLastUserIndex(messages) : -1;
    const res = await withRetry(() =>
      this.client.messages.create({
        model: options.model ?? this.model,
        max_tokens: options.maxTokens ?? 4096,
        temperature: options.temperature ?? 0,
        ...(options.system ? { system: options.system } : {}),
        messages: messages.map((m, i) => {
          if (i !== lastUserIdx) return { role: m.role, content: m.content };
          return {
            role: m.role,
            content: [
              ...images.map((img) => ({
                type: 'image' as const,
                source: {
                  type: 'base64' as const,
                  media_type: assertImageMediaType(img.mediaType),
                  data: img.base64,
                },
              })),
              { type: 'text' as const, text: m.content },
            ],
          };
        }),
      }),
    );
    return res.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('')
      .trim();
  }
}

/** Index of the last user-role message, or -1. */
function findLastUserIndex(messages: ChatMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === 'user') return i;
  }
  return -1;
}

class OpenAIChatProvider implements ChatProvider {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(apiKey: string, model: string) {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<string> {
    const images = options.images ?? [];
    const lastUserIdx = images.length > 0 ? findLastUserIndex(messages) : -1;
    const res = await withRetry(() =>
      this.client.chat.completions.create({
        model: options.model ?? this.model,
        max_tokens: options.maxTokens ?? 4096,
        temperature: options.temperature ?? 0,
        messages: [
          ...(options.system ? [{ role: 'system' as const, content: options.system }] : []),
          ...messages.map((m, i) => {
            if (i !== lastUserIdx) return { role: m.role, content: m.content };
            return {
              role: m.role,
              content: [
                { type: 'text' as const, text: m.content },
                ...images.map((img) => ({
                  type: 'image_url' as const,
                  image_url: { url: `data:${img.mediaType};base64,${img.base64}` },
                })),
              ],
            };
          }),
        ] as Parameters<OpenAI['chat']['completions']['create']>[0]['messages'],
      }),
    );
    return res.choices[0]?.message.content?.trim() ?? '';
  }
}

class OpenAIEmbedder {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(apiKey: string, model: string) {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
      const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
      const res = await withRetry(() => this.client.embeddings.create({ model: this.model, input: batch }));
      out.push(...res.data.map((d) => d.embedding));
    }
    return out;
  }
}

/**
 * Build an {@link LLMClient} from config. `chat` uses `LLM_PROVIDER`
 * (anthropic|openai); `embed` always uses OpenAI (`EMBEDDING_API_KEY`).
 * Throws only when a capability is used without its key being configured.
 */
export function createLLMClient(cfg: Config = config): LLMClient {
  const anthropicKey = cfg.ANTHROPIC_API_KEY ?? cfg.LLM_API_KEY;

  let chatProvider: ChatProvider | null = null;
  if (cfg.LLM_PROVIDER === 'openai') {
    if (cfg.LLM_API_KEY) chatProvider = new OpenAIChatProvider(cfg.LLM_API_KEY, cfg.LLM_MODEL);
  } else if (anthropicKey) {
    chatProvider = new AnthropicChatProvider(anthropicKey, cfg.LLM_MODEL);
  }

  const embedder = cfg.EMBEDDING_API_KEY
    ? new OpenAIEmbedder(cfg.EMBEDDING_API_KEY, cfg.EMBEDDING_MODEL)
    : null;

  return {
    chat(messages, options) {
      if (!chatProvider) {
        throw new Error(
          `No chat API key configured for provider "${cfg.LLM_PROVIDER}" (set ANTHROPIC_API_KEY/LLM_API_KEY).`,
        );
      }
      return chatProvider.chat(messages, options);
    },
    embed(texts) {
      if (!embedder) throw new Error('No EMBEDDING_API_KEY configured for embeddings.');
      return embedder.embed(texts);
    },
  };
}
