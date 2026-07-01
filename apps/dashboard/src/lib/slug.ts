/**
 * Broker slug helper. The implementation lives in `@brokercomply/shared` so the
 * create path (here) and the form-ingestion name matcher use the exact same
 * normalisation. Re-exported to keep the local `./slug` import path stable.
 */
export { brokerSlug } from "@brokercomply/shared";
