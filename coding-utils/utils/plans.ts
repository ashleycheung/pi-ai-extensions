/**
 * Plan management utilities for PLAN mode.
 *
 * Plans are stored as markdown files in <workspace>/.pi/plans/plan.<ID>.md
 * The title of a plan is the first heading (# or ##) in its markdown content.
 */
import { mkdir, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  CONFIG_DIR_NAME,
  createEditToolDefinition,
  withFileMutationQueue,
} from "@mariozechner/pi-coding-agent";

/**
 * Returns the plans directory path for the given workspace.
 */
export function getPlanDir(cwd: string): string {
  return join(cwd, CONFIG_DIR_NAME, "plans");
}

/**
 * Returns the full file path for a plan with the given ID.
 */
export function planFilePath(cwd: string, planId: string): string {
  return join(getPlanDir(cwd), `plan.${planId}.md`);
}

/**
 * Extracts the first heading (# or ##) from markdown content as the title.
 * Returns undefined if no heading is found.
 */
export function getPlanTitle(markdown: string): string | undefined {
  const match = markdown.match(/^#{1,2}\s+(.+)$/m);
  return match ? match[1].trim() : undefined;
}

/**
 * Reads and returns the content of a plan given its ID.
 * Returns undefined if the plan file does not exist or cannot be read.
 */
export async function getPlan(
  cwd: string,
  planId: string
): Promise<string | undefined> {
  try {
    const content = await readFile(planFilePath(cwd, planId), "utf8");
    return content;
  } catch {
    return undefined;
  }
}

/**
 * Lists all plans with their ID and title.
 * Returns an array of { id, title } objects.
 */
export async function listPlans(
  cwd: string
): Promise<{ id: string; title: string; updatedAt: number }[]> {
  const plansDir = getPlanDir(cwd);
  let files: string[];
  try {
    files = await readdir(plansDir);
  } catch {
    return [];
  }

  const results: { id: string; title: string; updatedAt: number }[] = [];
  const planRegex = /^plan\.(.+)\.md$/;

  for (const file of files) {
    const match = file.match(planRegex);
    if (!match) continue;

    const planId = match[1];
    try {
      const content = await readFile(join(plansDir, file), "utf8");
      const title = getPlanTitle(content) ?? planId;
      const stats = await stat(join(plansDir, file));
      results.push({ id: planId, title, updatedAt: stats.mtimeMs });
    } catch {
      // Skip files that can't be read
    }
  }

  // Sort by mtime descending (latest edit first), tiebreak by id
  results.sort((a, b) => {
    const diff = b.updatedAt - a.updatedAt;
    if (diff !== 0) return diff > 0 ? 1 : -1;
    return a.id.localeCompare(b.id);
  });
  return results;
}

/**
 * Formats a timestamp (ms since epoch) as a relative time string.
 * Returns e.g. "30 secs ago", "3 mins ago", "1 hour ago", "2 days ago".
 */
export function formatRelativeTime(timestampMs: number): string {
  const diffMs = Date.now() - timestampMs;
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} day${days > 1 ? "s" : ""} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  if (minutes > 0) return `${minutes} min${minutes > 1 ? "s" : ""} ago`;
  return `${seconds} sec${seconds !== 1 ? "s" : ""} ago`;
}

/**
 * Creates a new plan with the given title and returns the generated ID.
 * The plan file is saved as <workspace>/.pi/plans/plan.<ID>.md
 */
export async function createPlan(
  cwd: string,
  title: string
): Promise<string> {
  const plansDir = getPlanDir(cwd);
  await mkdir(plansDir, { recursive: true });

  const planId = randomUUID();
  const content = `# ${title}\n\n`;
  await writeFile(planFilePath(cwd, planId), content, "utf8");

  return planId;
}

/**
 * Deletes a plan file by its ID.
 * Returns `true` if the plan was deleted, `false` if it didn't exist.
 */
export async function deletePlan(
  cwd: string,
  planId: string
): Promise<boolean> {
  try {
    await unlink(planFilePath(cwd, planId));
    return true;
  } catch {
    return false;
  }
}

/**
 * Unescapes common escape sequences (backslash-backtick -> backtick,
 * double-backslash -> backslash, literal backslash-n/backslash-t -> newline/
 * tab). Used to build matching variants so hand-written anchors can match
 * stored plan text (which keeps those sequences as-is).
 */
function unescapeEscapes(text: string): string {
  return text
    .replace(/\\\\/g, "\\")
    .replace(/\\`/g, "`")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t");
}

/** Inverse of unescapeEscapes: plain backtick -> backslash-backtick, etc. */
function escapeEscapes(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t");
}

/** Result of an editPlan call. */
export interface EditPlanResult {
  applied: boolean;
  /** Why the edit failed (only present when applied === false). */
  reason?: string;
}

/** Runs the native edit tool with exact text matching. Returns false when oldText isn't found. */
async function applyExactEdit(
  cwd: string,
  path: string,
  oldText: string,
  newText: string
): Promise<boolean> {
  // Create the native edit tool definition and invoke its execute method.
  // The _ctx parameter is unused by the edit tool's execute implementation,
  // so we pass a minimal placeholder.
  const editTool = createEditToolDefinition(cwd);
  try {
    await editTool.execute(
      "edit-plan-internal",
      { path, edits: [{ oldText, newText }] },
      undefined, // signal
      undefined, // onUpdate
      {} as any // ctx (unused by execute)
    );
    return true;
  } catch (err) {
    // If the error is about oldText not being found, return false.
    // The edit tool throws "Could not find the exact text in ..." or
    // "Could not edit file: ..." when the file doesn't exist.
    const message = err instanceof Error ? err.message : String(err);
    if (
      message.startsWith("Could not find") ||
      message.startsWith("Could not edit file") ||
      message.startsWith("oldText must not be empty")
    ) {
      return false;
    }
    throw err;
  }
}

/**
 * Fallback for when the exact match fails: tries a few escape-normalized
 * variants of oldText (raw, unescaped, escaped) against the raw stored
 * content — e.g. a hand-written plain backtick matching a stored
 * backslash-backtick, and vice versa — and applies a surgical replacement
 * that leaves the rest of the file untouched. Returns false when no variant
 * matches.
 */
async function applyFallbackEdit(
  path: string,
  oldText: string,
  newText: string
): Promise<boolean> {
  let content: string;
  try {
    content = await readFile(path, "utf8");
  } catch {
    return false;
  }

  const variants = new Set([
    oldText,
    unescapeEscapes(oldText),
    escapeEscapes(oldText),
  ]);

  for (const variant of variants) {
    if (!variant || !content.includes(variant)) continue;
    const updated = content.replace(variant, newText);
    await withFileMutationQueue(path, async () => {
      await writeFile(path, updated, "utf8");
    });
    return true;
  }
  return false;
}

/**
 * Edits a plan file by replacing oldText with newText.
 * Tries the exact match first (native edit tool: fuzzy matching, BOM/line-ending
 * handling, diff generation), then falls back to an escape-normalized match for
 * anchors written with escaped sequences. Returns `{ applied: false, reason }`
 * (with a tail hint) when oldText could not be found either way.
 */
export async function editPlan(
  cwd: string,
  planId: string,
  oldText: string,
  newText: string
): Promise<EditPlanResult> {
  const path = planFilePath(cwd, planId);

  if (await applyExactEdit(cwd, path, oldText, newText)) {
    return { applied: true };
  }
  if (await applyFallbackEdit(path, oldText, newText)) {
    return { applied: true };
  }

  let tail = "";
  try {
    const content = await readFile(path, "utf8");
    tail = content.slice(-200);
  } catch {
    // Plan file doesn't exist
  }

  return {
    applied: false,
    reason:
      `oldText not found in plan "${planId}". Matching is literal: escape ` +
      `sequences in the plan file (e.g. backslash-backtick, backslash-n) are ` +
      `stored as-is.` +
      (tail ? `\n\nPlan file tail:\n${tail}` : ""),
  };
}
