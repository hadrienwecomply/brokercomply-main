import { Client } from '@notionhq/client';
import { loadConfig } from '../config/index.js';

/**
 * Build a Notion API client from `NOTION_API_KEY`. Throws a readable error when
 * the token is missing — the importer needs its own internal-integration token
 * (the MCP connection is editor-side only and not available to scripts).
 */
export function createNotionClient(apiKey?: string): Client {
  const auth = apiKey ?? loadConfig().NOTION_API_KEY;
  if (!auth) {
    throw new Error(
      'NOTION_API_KEY is not set. Create a Notion internal integration, share the ' +
        '"Pilotage courtier - Full" databases with it, and add NOTION_API_KEY to .env.',
    );
  }
  return new Client({ auth });
}
