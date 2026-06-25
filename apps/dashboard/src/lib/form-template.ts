/**
 * Per-Fillout-form configuration (the "B" matching strategy + n8n routing).
 *
 * You own the Fillout forms, so register each one here keyed by its public
 * `formId`. The field ids map opaque Fillout question ids to the broker-
 * identifying answers (email / company / website); when a form isn't registered
 * (or a mapped field is empty), the ingestion falls back to a type/name
 * heuristic. `n8nWebhookUrl` overrides the default `N8N_WEBHOOK_URL` so each
 * form can trigger its own workflow.
 *
 * This file is versioned alongside the n8n workflow JSON exports in
 * `integrations/n8n/` — it's the documented contract between the two systems.
 */
export interface FormTemplate {
  /** Human label surfaced in the UI and sent to n8n as `formType`. */
  label: string;
  emailFieldId?: string;
  companyFieldId?: string;
  websiteFieldId?: string;
  /** Overrides the default n8n webhook URL for this form. */
  n8nWebhookUrl?: string;
}

/**
 * Registry of known forms. Empty by default — add entries as you publish forms.
 * Example shape (replace ids with the real Fillout question ids):
 *
 *   "vf2Kd9x...": {
 *     label: "Onboarding courtier",
 *     emailFieldId: "kQ1...",
 *     companyFieldId: "9aZ...",
 *     websiteFieldId: "p4R...",
 *     n8nWebhookUrl: "https://n8n.example.com/webhook/onboarding",
 *   },
 */
export const FORM_TEMPLATES: Record<string, FormTemplate> = {
  // 🇧🇪 Diagnostic de conformité. "Email de contact" is a ShortAnswer (not an
  // EmailInput), so it must be mapped explicitly — the type heuristic won't catch it.
  eMsizNkfBXus: {
    label: "Diagnostic de conformité",
    emailFieldId: "3kzV", // Email de contact
    companyFieldId: "5xrk", // Nom de votre bureau
    websiteFieldId: "w5YE", // Lien de votre site internet (often empty)
  },
};

export function getFormTemplate(formId: string | null | undefined): FormTemplate | undefined {
  if (!formId) return undefined;
  return FORM_TEMPLATES[formId];
}

/** Display label for a form: its registered label, else the raw id, else "Formulaire". */
export function formTypeLabel(formId: string | null | undefined): string {
  return getFormTemplate(formId)?.label ?? formId ?? "Formulaire";
}
