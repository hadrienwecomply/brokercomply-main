export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** A base64-encoded image attached to a vision chat call. */
export interface ChatImage {
  /** Raw base64 (no data: prefix). */
  base64: string;
  /** e.g. 'image/png', 'image/jpeg', 'image/webp'. */
  mediaType: string;
}

export interface ChatOptions {
  system?: string;
  maxTokens?: number;
  temperature?: number;
  /** Override the configured chat model. */
  model?: string;
  /**
   * Images to attach to the last user message (vision). Supported by the
   * Anthropic provider; the OpenAI provider sends them as image_url data URIs.
   */
  images?: ChatImage[];
}

/**
 * Provider-agnostic LLM client. `chat` goes through the configured provider
 * (Anthropic by default); `embed` always goes through OpenAI, since Anthropic
 * has no embeddings API.
 */
export interface LLMClient {
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<string>;
  embed(texts: string[]): Promise<number[][]>;
}
