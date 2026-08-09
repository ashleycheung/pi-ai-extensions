import { type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { modeState } from "../store/mode-state";
import { exemptionStore } from "../store/exemption-store";
import {
  exemptionKeyFromCommandString,
  isToolBlockedInMode,
  recordExemption,
  toolNameForCommandString,
} from "../utils/exemption";

export function registerRequestBlockExemptionTool(pi: ExtensionAPI) {
  pi.registerTool({
    name: "request_block_exemption",
    label: "Request Block Exemption",
    description:
      "Requests a user-approved exemption for a tool call blocked by the current mode. Shows an approve/reject dialog with the command and the agent's reason; on approval the agent must re-issue the original tool call. Identical requests are cached for the session (auto-approved or auto-blocked without re-prompting).",
    promptSnippet:
      "Asks the user to approve a tool call that the current mode blocks (bash, edit, plan tools). On approval, re-issue the original tool call — it will be allowed.",
    promptGuidelines: [
      "When a bash/edit/plan tool call is blocked by the current mode, call request_block_exemption with the blocked command and a clear reason instead of only asking the user to switch modes.",
      "For bash, pass the exact command string. For blocked edit/plan tools pass the canonical form: edit:<path>, plan_edit:<planId>, plan_delete:<planId>, or plan_create.",
      "If the result says the request was approved, re-issue the exact original tool call — it will be allowed. If rejected, do NOT retry: it stays blocked for the session.",
    ],
    parameters: Type.Object({
      command: Type.String({
        description:
          "The blocked command to request an exemption for. For bash: the exact command string. For blocked edit/plan tools: edit:<path>, plan_edit:<planId>, plan_delete:<planId>, or plan_create.",
      }),
      exemptionReason: Type.String({
        description:
          "Why this command should be allowed despite the current mode's restrictions",
      }),
    }),
    async execute(
      toolCallId,
      params: { command: string; exemptionReason: string },
      signal,
      onUpdate,
      ctx
    ): Promise<any> {
      if (signal?.aborted) {
        return { content: [{ type: "text", text: "Cancelled" }] };
      }

      const key = exemptionKeyFromCommandString(params.command);

      // Cached decision — auto-approve or auto-block without re-prompting.
      const cached = exemptionStore.decisions.get(key);
      if (cached) {
        if (cached.approved) {
          return {
            content: [
              {
                type: "text",
                text: "This command was already approved by the user earlier in this session. Re-issue the original tool call now — it will be allowed.",
              },
            ],
            details: { key, cached: true, approved: true },
          };
        }
        return {
          content: [
            {
              type: "text",
              text: `This command was already rejected by the user earlier in this session${
                cached.reason ? `: ${cached.reason}` : ""
              }. Do not retry it.`,
            },
          ],
          details: { key, cached: true, approved: false, reason: cached.reason },
        };
      }

      if (!ctx.hasUI) {
        throw new Error(
          "Cannot request a block exemption: no interactive UI is available in this context. Ask the user to switch to execute mode instead."
        );
      }

      const toolName = toolNameForCommandString(params.command);

      // Nothing is actually blocked — the tool is unnecessary.
      if (
        !isToolBlockedInMode(toolName, { command: params.command }, modeState.mode)
      ) {
        return {
          content: [
            {
              type: "text",
              text: `"${params.command}" is already allowed in the current mode — no exemption needed. Run it directly.`,
            },
          ],
          details: { key, blocked: false },
        };
      }

      onUpdate?.({
        content: [{ type: "text", text: "Awaiting user approval..." }],
        details: { key },
      });

      const approved = await ctx.ui.confirm(
        "Approve blocked command?",
        `Command: ${params.command}\n\nAgent reason: ${params.exemptionReason}`
      );

      if (approved) {
        recordExemption(key, { approved: true, ts: Date.now() });
        return {
          content: [
            {
              type: "text",
              text: `Approved by the user. Re-issue the exact original ${toolName} tool call now — it will be allowed.`,
            },
          ],
          details: { key, approved: true },
        };
      }

      // Rejected — optionally capture a user reason (Esc/empty = none).
      const reason = await ctx.ui.input(
        "Reason for rejection (optional — Esc to skip)"
      );
      recordExemption(key, {
        approved: false,
        reason: reason || undefined,
        ts: Date.now(),
      });
      return {
        content: [
          {
            type: "text",
            text: `Rejected by the user${reason ? `: ${reason}` : ""}. Do not retry this call — it stays blocked for this session.`,
          },
        ],
        details: { key, approved: false, reason: reason || undefined },
      };
    },
  });
}
