import {
  type ExtensionAPI,
  type ToolCallEvent,
  type ToolCallEventResult,
} from "@mariozechner/pi-coding-agent";
import { AIMode, mode, PLAN_MODE_MESSAGE, EXPLORE_MODE_MESSAGE } from "./mode";
import { isSafeCommand } from "./utils";
import { transformGrepCommands, transformFindCommands } from "./transform";

export function registerCommandSafetyHandler(pi: ExtensionAPI) {
  pi.on(
    "tool_call" as any,
    async (event: ToolCallEvent, ctx): Promise<ToolCallEventResult | void> => {
      switch (event.toolName) {
        // Bash tool
        case "bash": {
          if (
            (mode === AIMode.Plan || mode === AIMode.Explore) &&
            !isSafeCommand(String(event.input.command))
          ) {
            const modeName = mode === AIMode.Plan ? "Plan" : "Explore";
            const modeMessage =
              mode === AIMode.Plan ? PLAN_MODE_MESSAGE : EXPLORE_MODE_MESSAGE;
            pi.sendUserMessage(modeMessage, { deliverAs: "steer" });
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
          if (mode === AIMode.Plan || mode === AIMode.Explore) {
            const modeName = mode === AIMode.Plan ? "Plan" : "Explore";
            const modeMessage =
              mode === AIMode.Plan ? PLAN_MODE_MESSAGE : EXPLORE_MODE_MESSAGE;
            pi.sendUserMessage(modeMessage, { deliverAs: "steer" });
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
          if (mode === AIMode.Explore) {
            pi.sendUserMessage(EXPLORE_MODE_MESSAGE, { deliverAs: "steer" });
            return {
              block: true,
              reason: `
              You are in Explore Mode.
              You must not create, edit, or delete plans.
              You must explicitly ask the user to change to another mode to modify plans`,
            };
          }
        }
      }
    }
  );
}
