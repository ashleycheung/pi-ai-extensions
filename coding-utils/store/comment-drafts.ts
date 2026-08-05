/**
 * Session-only draft store for the shared comment viewer.
 *
 * Keeps the comment text typed in the viewer (readplan / list_plans / diff)
 * when the user closes the viewer without submitting, and restores it on the
 * next open. Drafts are cleared when a comment is submitted (the text has been
 * consumed as a message).
 *
 * Lives in memory only — drafts do not survive pi restarts. Keyed by a caller
 * provided string (e.g. `plan:<cwd>:<planId>` or `diff:<cwd>`), so each plan /
 * workspace keeps its own draft.
 *
 * Uses a const Map (mutated in place) instead of `export let` so cross-module
 * changes are visible under CommonJS transpilation — same pattern as the other
 * modules in store/.
 */
const drafts = new Map<string, string>();

/**
 * Returns the saved draft for the given key, or undefined if none.
 */
export function getCommentDraft(key: string): string | undefined {
  return drafts.get(key);
}

/**
 * Saves the draft text for the given key. Empty/falsy text deletes the key
 * (the user cleared it manually).
 */
export function saveCommentDraft(key: string, text: string): void {
  if (text) {
    drafts.set(key, text);
  } else {
    drafts.delete(key);
  }
}

/**
 * Discards the draft for the given key (called on submit — the text was sent).
 */
export function clearCommentDraft(key: string): void {
  drafts.delete(key);
}
