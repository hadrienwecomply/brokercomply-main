import "server-only";

/**
 * In-process registry of pending confirmations for irreversible tools. The
 * PreToolUse hook parks on a promise here while the SSE stream asks the officer
 * to approve/deny; the `/api/agent/confirm` route resolves it. Single-node only
 * (matches the deployment); a promise that is never answered auto-denies after
 * the timeout so an agent turn can't hang forever.
 */
interface Pending {
  resolve: (approved: boolean) => void;
  timer: ReturnType<typeof setTimeout>;
}

// Cache the registry on globalThis: in Next dev/prod the `/chat` and `/confirm`
// route handlers are bundled separately, so a plain module-level Map would NOT
// be shared between them. globalThis is the one registry both routes see.
const globalForConfirm = globalThis as unknown as {
  __bcConfirm?: { pending: Map<string, Pending>; counter: number };
};
const store = (globalForConfirm.__bcConfirm ??= { pending: new Map(), counter: 0 });
const pending = store.pending;

/** Create a pending confirmation; resolves to false (deny) after `timeoutMs`. */
export function createPendingConfirmation(timeoutMs = 300_000): {
  id: string;
  promise: Promise<boolean>;
} {
  const id = `cf_${Date.now().toString(36)}_${(store.counter++).toString(36)}`;
  let resolveFn!: (approved: boolean) => void;
  const promise = new Promise<boolean>((res) => {
    resolveFn = res;
  });
  const timer = setTimeout(() => {
    pending.delete(id);
    resolveFn(false);
  }, timeoutMs);
  // Don't keep the event loop alive just for a pending confirmation.
  if (typeof timer === "object" && "unref" in timer) timer.unref();
  pending.set(id, { resolve: resolveFn, timer });
  return { id, promise };
}

/** Resolve a pending confirmation. Returns false if the id is unknown/expired. */
export function resolveConfirmation(id: string, approved: boolean): boolean {
  const p = pending.get(id);
  if (!p) return false;
  clearTimeout(p.timer);
  pending.delete(id);
  p.resolve(approved);
  return true;
}
