import {
  type ExtensionAPI,
  type ToolCallEvent,
  type ToolCallEventResult,
} from "@mariozechner/pi-coding-agent";
import { modeState } from "../store/mode-state";
import { AIMode } from "../store/mode-messages";
import { getUnsafeReason } from "../utils/command-patterns";
import {
  transformGrepCommands,
  transformFindCommands,
} from "../utils/transform";
import { getExemptionDecision, rejectedReason } from "../utils/exemption";

export function registerCommandSafetyHandler(pi: ExtensionAPI) {
  pi.on(
    "tool_call" as any,
    async (event: ToolCallEvent, ctx): Promise<ToolCallEventResult | void> => {
      switch (event.toolName) {
        // Bash tool
        case "bash": {
          const command = String(event.input.command);
          const exemption = getExemptionDecision("bash", event.input);

          // Previously rejected by the user — stay blocked, tell the agent why.
          if (exemption && !exemption.approved) {
            return { block: true, reason: rejectedReason(exemption) };
          }

          const unsafeReason = getUnsafeReason(command);
          if (
            !exemption?.approved &&
            (modeState.mode === AIMode.Plan ||
              modeState.mode === AIMode.Ask ||
              modeState.mode === AIMode.CodeReview) &&
            unsafeReason !== undefined
          ) {
            const modeName =
              modeState.mode === AIMode.Plan
                ? "Plan"
                : modeState.mode === AIMode.Ask
                ? "Ask"
                : "Code Review";
            const blockMessage = `You are in ${modeName} Mode. This bash command is not allowed: ${unsafeReason}. If you believe this command is necessary, you can use the request_block_exemption tool for an exemption to run this command (you'll get an approve/reject prompt) — or switch to execute mode.`;
            pi.sendUserMessage(blockMessage, { deliverAs: "steer" });
            return { block: true, reason: blockMessage };
          }

          if (!command) return;

          let finalCommand = command;
          finalCommand = transformGrepCommands(finalCommand);
          finalCommand = transformFindCommands(finalCommand);

          if (finalCommand !== command) {
            ctx.ui.notify(
              `Bash command transformed to: ${finalCommand}`,
              "info"
            );
          }

          const newInput: ToolCallEvent["input"] = {
            ...event.input,
            command: finalCommand,
          };
          return newInput as any;
        }
        case "edit": {
          const exemption = getExemptionDecision("edit", event.input);

          if (exemption && !exemption.approved) {
            return { block: true, reason: rejectedReason(exemption) };
          }

          if (
            !exemption?.approved &&
            (modeState.mode === AIMode.Plan ||
              modeState.mode === AIMode.Ask ||
              modeState.mode === AIMode.CodeReview)
          ) {
            const modeName =
              modeState.mode === AIMode.Plan
                ? "Plan"
                : modeState.mode === AIMode.Ask
                ? "Ask"
                : "Code Review";
            const blockMessage = `You are in ${modeName} Mode. Edits are strictly NOT allowed. If you believe this command is necessary, you can use the request_block_exemption tool for an exemption to run this command (you'll get an approve/reject prompt) — or switch to execute mode.`;
            pi.sendUserMessage(blockMessage, { deliverAs: "steer" });
            return { block: true, reason: blockMessage };
          }
        }
        case "plan_create":
        case "plan_edit":
        case "plan_delete": {
          const exemption = getExemptionDecision(event.toolName, event.input);

          if (exemption && !exemption.approved) {
            return { block: true, reason: rejectedReason(exemption) };
          }

          if (
            !exemption?.approved &&
            (modeState.mode === AIMode.Ask ||
              modeState.mode === AIMode.CodeReview)
          ) {
            const modeName =
              modeState.mode === AIMode.Ask ? "Ask" : "Code Review";
            const blockMessage = `You are in ${modeName} Mode. Plan modifications are strictly NOT allowed. If you believe this command is necessary, you can use the request_block_exemption tool for an exemption to run this command (you'll get an approve/reject prompt) — or switch to execute mode.`;
            pi.sendUserMessage(blockMessage, { deliverAs: "steer" });
            return { block: true, reason: blockMessage };
          }
        }
      }
    }
  );
}
