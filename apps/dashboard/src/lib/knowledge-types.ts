/**
 * Client-safe DTOs for knowledge units. No server-only / DB imports here, so
 * both the server data layer and client components can share these shapes.
 * Note: `embedding` and `searchVector` are intentionally absent.
 */
export interface KnowledgeRow {
  id: string;
  question: string;
  answer: string;
  topic: string | null;
  regulatoryRefs: string[] | null;
  language: string | null;
  author: string | null;
  confidence: number | null;
  sourceDate: string | null;
  origin: string;
  reviewStatus: string;
  isPublished: boolean;
  updatedBy: string | null;
  updatedAt: string | null;
}

export interface KnowledgeSource {
  id: string;
  messageId: string;
  subject: string | null;
  sender: string | null;
  receivedAt: string | null;
  direction: string | null;
}
