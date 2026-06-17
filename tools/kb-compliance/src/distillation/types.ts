import type { Language, Topic } from '@brokercomply/shared';

/** A distilled question/answer pair extracted from an email thread. */
export interface QaPair {
  /** Canonical reformulation of the question. */
  question: string;
  /** Synthesised answer, in its original language. */
  answer: string;
  topic: Topic;
  /** Regulatory references cited, e.g. ["Circ. FSMA 2023_12", "Loi 04/04/2014 art. 40"]. */
  regulatoryRefs: string[];
  language: Language | null;
  /** LLM self-assessed extraction confidence, 0–1. */
  confidence: number;
  /** Officer who authored the answer (not who asked). */
  author: string | null;
}
