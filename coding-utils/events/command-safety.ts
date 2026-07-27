import {
  type ExtensionAPI,
  type ToolCallEvent,
  type ToolCallEventResult,
} from "@mariozechner/pi-coding-agent";
import { modeState } from "../store/mode-state";
import { AIMode } from "../store/mode-messages";
import { isSafeCommand } from "../utils/command-patterns";
import { transformGrepCommands, transformFindCommands } from "../utils/transform";

export function registerCommandSafetyHandler(pi: ExtensionAPI) {
  pi.on(
    "tool_call" as any,
    async (event: ToolCallEvent, ctx): Promise<ToolCallEventResult | void> => {
      switch (event.toolName) {
        // Bash tool
        case "bash": {
          if (
            (modeState.mode === AIMode.Plan || modeState.mode === AIMode.Ask || modeState.mode === AIMode.CodeReview) &&
            !isSafeCommand(String(event.input.command))
          ) {
            const modeName = modeState.mode === AIMode.Plan ? "Plan" : modeState.mode === AIMode.Ask ? "Ask" : "Code Review";
            pi.sendUserMessage(`You are in ${modeName} Mode. Destructive bash commands are strictly NOT allowed.`, { deliverAs: "steer" });
            return {
              block: true,
              reason: `
              You are in ${modeName} Mode.
              Destructive bash commands are strictly NOT allowed.
              You must explicitly ask the user to change to execute mode to enable destructive bash commands`,
            };
          }

          const command = (event.input.command as any)?.trim() as
            | string
            | undefined;
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
          if (modeState.mode === AIMode.Plan || modeState.mode === AIMode.Ask || modeState.mode === AIMode.CodeReview) {
            const modeName = modeState.mode === AIMode.Plan ? "Plan" : modeState.mode === AIMode.Ask ? "Ask" : "Code Review";
            pi.sendUserMessage(`You are in ${modeName} Mode. Edits are strictly NOT allowed.`, { deliverAs: "steer" });
            return {
              block: true,
              reason: `
              You are in ${modeName} Mode.
              Edits are strictly NOT allowed.
              You must explicitly ask the user to change to execute mode to enable file editing`,
            };
          }
        }
        case "plan_create":
        case "plan_edit":
        case "plan_delete": {
          if (modeState.mode === AIMode.Ask || modeState.mode === AIMode.CodeReview) {
            const modeName = modeState.mode === AIMode.Ask ? "Ask" : "Code Review";
            pi.sendUserMessage(`You are in ${modeName} Mode. Plan modifications are strictly NOT allowed.`, { deliverAs: "steer" });
            return {
              block: true,
              reason: `
              You are in ${modeName} Mode.
              You must not create, edit, or delete plans.
              You must explicitly ask the user to change to another mode to modify plans`,
            };
          }
        }
      }
    }
  );
}
