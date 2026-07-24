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
 * Edits a plan file by replacing oldText with newText.
 * Uses the native edit tool (fuzzy matching, BOM/line-ending handling, diff generation).
 * Returns `true` if the replacement was applied, `false` if oldText was not found.
 */
export async function editPlan(
  cwd: string,
  planId: string,
  oldText: string,
  newText: string
): Promise<boolean> {
  const path = planFilePath(cwd, planId);

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
      {} as any  // ctx (unused by execute)
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
