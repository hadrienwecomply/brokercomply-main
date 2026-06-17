/**
 * Client-safe copies of the controlled vocabularies for edit dropdowns. The
 * server validates against the canonical TOPICS/LANGUAGES in @brokercomply/shared
 * (source of truth); this mirror exists only so client components don't import
 * the server-side shared barrel.
 */
export const TOPIC_OPTIONS = [
  "AMLR",
  "fit_and_proper",
  "IDD",
  "EGR",
  "mystery_shopping",
  "general_compliance",
  "other",
] as const;

export const LANGUAGE_OPTIONS = ["fr", "nl", "en"] as const;
