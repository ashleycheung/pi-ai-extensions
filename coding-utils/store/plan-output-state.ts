/**
 * Shared plan output mode state + persistence.
 *
 * Controls how the readplan / list_plans commands present plan content:
 * - "viewer": open the interactive TUI viewer window with a comment input
 *   (the original behavior of list_plans).
 * - "notify": just send a notification (the behavior before this toggle was
 *   introduced).
 *
 * Uses a shared mutable object (same pattern as mode-state.ts) so cross-module
 * changes are visible under CommonJS transpilation. Never use `export let`.
 *
 * The chosen mode is persisted to <agentDir>/plan-output-mode.json so it
 * survives pi restarts. The default is "viewer".
 */
import { getAgentDir } from "@mariozechner/pi-coding-agent";
import { join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

export type PlanOutputMode = "viewer" | "notify";

export const planOutputState = {
  mode: "viewer" as PlanOutputMode,
};

const STATE_FILE = "plan-output-mode.json";

function stateFilePath(): string {
  return join(getAgentDir(), STATE_FILE);
}

/**
 * Loads the persisted output mode (if valid) into planOutputState.
 * On any error (missing file, bad JSON, unknown value) the "viewer"
 * default is kept. Never throws.
 */
export async function loadPlanOutputState(): Promise<void> {
  try {
    const raw = await readFile(stateFilePath(), "utf8");
    const data = JSON.parse(raw) as { mode?: unknown };
    if (data.mode === "viewer" || data.mode === "notify") {
      planOutputState.mode = data.mode;
    }
  } catch {
    // Missing file / unreadable / invalid -> keep default
  }
}

/**
 * Persists the current planOutputState.mode.
 * Swallows errors so a persistence failure never breaks a command.
 */
export async function savePlanOutputState(): Promise<void> {
  try {
    await mkdir(getAgentDir(), { recursive: true });
    await writeFile(
      stateFilePath(),
      JSON.stringify({ mode: planOutputState.mode }, null, 2),
      "utf8"
    );
  } catch {
    // Ignore persistence failures
  }
}
