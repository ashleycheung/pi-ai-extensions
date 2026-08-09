/**
 * Canonical cache keys + gating helpers for `request_block_exemption`.
 *
 * Both the exemption tool (agent-provided `command` string) and the safety
 * handler (blocked tool_call event) derive identical keys through this module,
 * so an approved exemption matches the agent's retried call.
 */
import { AIMode } from "../store/mode-messages";
import { exemptionStore, type ExemptionDecision } from "../store/exemption-store";
import { normalizeCommand, getUnsafeReason } from "./command-patterns";

/** Restricted modes for each blocked tool type (mirrors command-safety.ts). */
const BLOCKING_MODES = new Set([AIMode.Plan, AIMode.Ask, AIMode.CodeReview]);
const PLAN_BLOCKING_MODES = new Set([AIMode.Ask, AIMode.CodeReview]);

/**
 * Maps an agent-provided `command` string to the tool it refers to:
 * `edit:<path>` → edit, `plan_*` → plan tool, anything else → bash.
 */
export function toolNameForCommandString(command: string): string {
  const trimmed = command.trim();
  if (/^edit:/.test(trimmed)) return "edit";
  if (/^plan_edit:/.test(trimmed)) return "plan_edit";
  if (/^plan_delete:/.test(trimmed)) return "plan_delete";
  if (/^plan_create(?::|$)/.test(trimmed)) return "plan_create";
  return "bash";
}

/**
 * Maps an agent-provided `command` string to the canonical exemption key:
 * `edit:<path>`, `plan_edit:<id>`, `plan_delete:<id>`, `plan_create`,
 * or `bash:<normalized command>`.
 */
export function exemptionKeyFromCommandString(command: string): string {
  const match = /^(edit|plan_edit|plan_delete):(.+)$/.exec(command.trim());
  if (match) return `${match[1]}:${match[2]}`;
  if (/^plan_create(?::.*)?$/.test(command.trim())) return "plan_create";
  return `bash:${normalizeCommand(command)}`;
}

/**
 * Derives the canonical exemption key from a blocked tool_call event.
 * Returns undefined for tools that can't be exempted (e.g. `write`).
 */
export function exemptionKeyFromEvent(
  toolName: string,
  input: Record<string, unknown>
): string | undefined {
  switch (toolName) {
    case "bash":
      return `bash:${normalizeCommand(String(input.command ?? ""))}`;
    case "edit":
      return typeof input.path === "string" ? `edit:${input.path}` : undefined;
    case "plan_create":
      return "plan_create";
    case "plan_edit":
    case "plan_delete":
      return typeof input.planId === "string" ? `${toolName}:${input.planId}` : undefined;
    default:
      return undefined;
  }
}

/**
 * Whether the given tool call would actually be blocked in `mode`
 * (mirrors the gating in events/command-safety.ts).
 */
export function isToolBlockedInMode(
  toolName: string,
  input: Record<string, unknown>,
  mode: AIMode
): boolean {
  switch (toolName) {
    case "bash":
      return (
        BLOCKING_MODES.has(mode) &&
        getUnsafeReason(String(input.command ?? "")) !== undefined
      );
    case "edit":
      return BLOCKING_MODES.has(mode);
    case "plan_create":
    case "plan_edit":
    case "plan_delete":
      return PLAN_BLOCKING_MODES.has(mode);
    default:
      return false;
  }
}

/** Look up a cached decision for a tool call, if any. */
export function getExemptionDecision(
  toolName: string,
  input: Record<string, unknown>
): ExemptionDecision | undefined {
  const key = exemptionKeyFromEvent(toolName, input);
  return key ? exemptionStore.decisions.get(key) : undefined;
}

/** Block reason for a previously rejected (cached) decision. */
export function rejectedReason(decision: ExemptionDecision): string {
  return `This call was previously rejected by the user${decision.reason ? `: ${decision.reason}` : "."}`;
}

/** Record a user decision for a canonical key. */
export function recordExemption(key: string, decision: ExemptionDecision): void {
  exemptionStore.decisions.set(key, decision);
}
