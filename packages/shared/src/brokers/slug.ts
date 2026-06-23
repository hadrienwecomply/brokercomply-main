/**
 * URL-safe slug from a company name, e.g. "Élite Broker" → "elite-broker".
 *
 * This is the single source of truth for broker slugs: it generates the stable
 * `brokers.slug` identity on create, and the form-ingestion matcher re-derives
 * it from a submitted company name to match by name (so both sides must use the
 * exact same normalisation — hence one shared implementation).
 */
export function brokerSlug(societe: string): string {
  return societe
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
