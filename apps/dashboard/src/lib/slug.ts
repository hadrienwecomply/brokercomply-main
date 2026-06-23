/** URL-safe slug from a company name, e.g. "Élite Broker" → "elite-broker". */
export function brokerSlug(societe: string): string {
  return societe
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
