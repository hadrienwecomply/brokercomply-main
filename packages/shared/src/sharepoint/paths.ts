/**
 * Drive-path helpers for Microsoft Graph path addressing
 * (`/drives/{id}/root:/{path}:`). Kept pure so they are trivially unit tested.
 */

/** Strip leading/trailing slashes. */
export function trimSlashes(path: string): string {
  return path.replace(/^\/+|\/+$/g, '');
}

/** Characters SharePoint/OneDrive forbid in an item name. */
const ILLEGAL_NAME_CHARS = /["*:<>?/\\|]/g;

/**
 * Turn an arbitrary string (a company name) into a valid SharePoint folder name:
 * replaces forbidden characters with a space, collapses whitespace, and strips
 * trailing dots/spaces (also forbidden). Falls back to "broker" if nothing
 * usable remains. Names that are already valid pass through unchanged, so this
 * doesn't break matching of existing human-named folders.
 */
export function sanitizeFolderName(name: string): string {
  const cleaned = name
    .replace(ILLEGAL_NAME_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '')
    .trim();
  return cleaned || 'broker';
}

/** Join path segments, dropping empties and stray slashes. */
export function joinPath(...segments: Array<string | undefined>): string {
  return segments
    .filter((s): s is string => Boolean(s))
    .map(trimSlashes)
    .filter(Boolean)
    .join('/');
}

/**
 * Percent-encode each path segment, preserving the `/` separators. Graph path
 * addressing requires spaces and `&` encoded inside segments, which
 * `encodeURIComponent` handles (space → %20, `&` → %26).
 */
export function encodeDrivePath(path: string): string {
  return trimSlashes(path).split('/').filter(Boolean).map(encodeURIComponent).join('/');
}

/**
 * Extract the drive-relative path from a driveItem `parentReference.path`.
 * Graph returns e.g. "/drives/<id>/root:/01 - Clients/Acme" → "01 - Clients/Acme".
 * Returns '' for items directly at the drive root, or null when the value has no
 * `root:` marker (unexpected shape).
 */
export function drivePathFromParentRef(parentPath: string | undefined): string | null {
  if (!parentPath) return null;
  const marker = 'root:';
  const idx = parentPath.indexOf(marker);
  if (idx === -1) return null;
  const rel = parentPath.slice(idx + marker.length).replace(/^\/+/, '');
  return decodeURIComponent(rel);
}

/**
 * Given the configured broker-folders root and a driveItem's parentReference
 * path, return the immediate broker-folder segment the item belongs to (the
 * first path segment under root), or null when the item is not under root.
 *
 *   root = "01 - Clients"
 *   ".../root:/01 - Clients/Acme/sub" → "Acme"
 *   ".../root:/01 - Clients/Acme"     → "Acme"
 *   ".../root:/01 - Clients"          → null  (the root itself)
 *   ".../root:/Other"                 → null
 */
export function brokerFolderFromItemPath(
  rootPath: string,
  parentRefPath: string | undefined,
): string | null {
  const rel = drivePathFromParentRef(parentRefPath);
  if (rel == null) return null;
  const root = trimSlashes(rootPath);
  if (rel === root) return null;
  const prefix = root ? root + '/' : '';
  if (root && !rel.startsWith(prefix)) return null;
  const remainder = rel.slice(prefix.length);
  const first = remainder.split('/')[0];
  return first || null;
}
