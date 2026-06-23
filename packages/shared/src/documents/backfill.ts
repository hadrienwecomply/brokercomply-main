/**
 * Pure decision logic for the SharePoint folder backfill, kept separate from the
 * Graph/DB I/O so it can be unit tested exhaustively. The CLI gathers the facts
 * (does the mapped path exist? does the auto-named folder exist? is another
 * broker already on the target path?) and this function decides what to do.
 *
 * Safety properties (Q2/Q9): never duplicates (links when a folder exists),
 * never deletes, never creates at a mapped-but-missing path, and refuses to link
 * a folder already owned by another broker.
 */
export type BackfillAction =
  | { kind: 'skip'; reason: string }
  | { kind: 'link'; path: string }
  | { kind: 'create'; path: string }
  | { kind: 'error'; reason: string; path?: string };

export interface BackfillFacts {
  /** Broker already has a linked folder → nothing to do. */
  alreadyLinked: boolean;
  /** Explicit drive-relative path from the mapping file, if any. */
  mappedPath?: string;
  /** Whether `mappedPath` resolves to an existing folder. */
  mappedExists?: boolean;
  /** Drive-relative path derived from the (sanitized) company name. */
  autoPath: string;
  /** Whether `autoPath` resolves to an existing folder (case-insensitive). */
  autoExists: boolean;
  /**
   * Real name of an existing folder that fuzzily matches the company name
   * (case/accents/spacing-insensitive) when the exact path doesn't resolve. When
   * set, we refuse to create — it's almost certainly the same folder under a
   * different spelling, and creating would duplicate it.
   */
  nearMatchName?: string;
  /** Slug/id of another broker already linked to the chosen target path, if any. */
  conflictBroker?: string;
}

export function decideBackfillAction(facts: BackfillFacts): BackfillAction {
  if (facts.alreadyLinked) return { kind: 'skip', reason: 'already linked' };

  if (facts.mappedPath !== undefined) {
    if (!facts.mappedExists) {
      return { kind: 'error', reason: 'mapped path does not exist', path: facts.mappedPath };
    }
    if (facts.conflictBroker) {
      return {
        kind: 'error',
        reason: `path already used by broker ${facts.conflictBroker}`,
        path: facts.mappedPath,
      };
    }
    return { kind: 'link', path: facts.mappedPath };
  }

  if (facts.conflictBroker) {
    return {
      kind: 'error',
      reason: `path already used by broker ${facts.conflictBroker}`,
      path: facts.autoPath,
    };
  }
  if (facts.autoExists) return { kind: 'link', path: facts.autoPath };
  if (facts.nearMatchName) {
    return {
      kind: 'error',
      reason: `near-match "${facts.nearMatchName}" already exists — add to mapping to link (not auto-creating, would duplicate)`,
      path: facts.autoPath,
    };
  }
  return { kind: 'create', path: facts.autoPath };
}
