/**
 * Microsoft Graph `driveItem` — only the fields the document sync depends on.
 * See https://learn.microsoft.com/graph/api/resources/driveitem
 */
export interface DriveItem {
  id: string;
  name?: string;
  webUrl?: string;
  size?: number;
  eTag?: string;
  cTag?: string;
  createdDateTime?: string;
  lastModifiedDateTime?: string;
  /** Present on folders. */
  folder?: { childCount?: number };
  /** Present on files. */
  file?: { mimeType?: string };
  /** Present on items removed in a delta response (tombstone). */
  deleted?: { state?: string };
  parentReference?: { driveId?: string; id?: string; path?: string };
  '@microsoft.graph.downloadUrl'?: string;
}

/** A page of driveItems (children listing or delta). */
export interface DriveItemPage {
  value: DriveItem[];
  '@odata.nextLink'?: string;
  '@odata.deltaLink'?: string;
}

/**
 * Transport abstraction over Microsoft Graph so the SharePoint logic stays unit
 * testable without a live tenant. The production implementation wraps the Graph
 * SDK `Client` (see transport.ts); tests pass a fake.
 *
 * Implementations MUST reject with an error carrying a numeric `statusCode` on
 * non-2xx responses (the Graph SDK already does), which callers use to detect
 * 404 (absent) and 410 (expired delta token).
 *
 * There is deliberately NO `delete` method: the sync is non-destructive on the
 * SharePoint side by construction — we never remove remote folders or files.
 */
export interface GraphTransport {
  get<T>(url: string): Promise<T>;
  post<T>(url: string, body: unknown): Promise<T>;
  put<T>(url: string, body: Buffer, contentType: string): Promise<T>;
}

/** Site + root-folder the broker folders live under. */
export interface SharePointSettings {
  /** Graph site id, e.g. "host.sharepoint.com,<siteGuid>,<webGuid>". */
  siteId: string;
  /** Drive-relative folder under which each broker folder is created. */
  rootPath: string;
}

/** A broker's folder, after ensuring/linking it. */
export interface FolderRef {
  id: string;
  name: string;
  webUrl: string;
  /** Drive-relative path of the folder. */
  path: string;
  /** true when we created it just now, false when it already existed. */
  created: boolean;
}

/** Result of a delta sweep: the changed items plus the next resume token. */
export interface DeltaResult {
  items: DriveItem[];
  deltaLink: string;
}
