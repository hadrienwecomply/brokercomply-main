export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  system?: string;
  maxTokens?: number;
  temperature?: number;
  /** Override the configured chat model. */
  model?: string;
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
