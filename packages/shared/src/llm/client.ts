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

class AnthropicChatProvider implements ChatProvider {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<string> {
    const res = await withRetry(() =>
      this.client.messages.create({
        model: options.model ?? this.model,
        max_tokens: options.maxTokens ?? 4096,
        temperature: options.temperature ?? 0,
        ...(options.system ? { system: options.system } : {}),
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      }),
    );
    return res.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('')
      .trim();
  }
}

class OpenAIChatProvider implements ChatProvider {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(apiKey: string, model: string) {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<string> {
    const res = await withRetry(() =>
      this.client.chat.completions.create({
        model: options.model ?? this.model,
        max_tokens: options.maxTokens ?? 4096,
        temperature: options.temperature ?? 0,
        messages: [
          ...(options.system ? [{ role: 'system' as const, content: options.system }] : []),
          ...messages.map((m) => ({ role: m.role, content: m.content })),
        ],
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
