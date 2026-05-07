/**
 * This extension add some code utils to make programming easier
 */
import type {
  ExtensionAPI,
  ToolCallEvent,
  ToolCallEventResult,
} from "@mariozechner/pi-coding-agent";

const IGNORE_DIRS = ["node_modules", "dist", "build"];

/**
 * Exclude all the directories from grep
 */
function transformGrepCommands(bash: string) {
  let transformedBash = bash;
  transformedBash = transformedBash.replace(
    /\bgrep\b/g,
    `grep ${IGNORE_DIRS.map((dir) => `--exclude-dir=${dir}`).join(" ")}`
  );
  return transformedBash;
}

/**
 * Add exclude directories to find
 */
function transformFindCommands(bash: string) {
  let transformedBash = bash;
  transformedBash = transformedBash.replace(
    /\bfind \S+(?=\s+-|\s+\||$)/g,
    (match) =>
      `${match} ${IGNORE_DIRS.map((dir) => `-name "${dir}" -prune -o`).join(
        " "
      )}`
  );
  return transformedBash;
}

export default function (pi: ExtensionAPI) {
  // React to events
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.notify("Coding Utils Loaded", "info");
  });

  // Check tool calls
  pi.on(
    "tool_call" as any,
    async (event: ToolCallEvent, ctx): Promise<ToolCallEventResult | void> => {
      // Bash tool
      if (event.toolName === "bash") {
        const command = (event.input.command as any)?.trim() as
          | string
          | undefined;
        if (!command) return;

        let finalCommand = command;
        finalCommand = transformGrepCommands(finalCommand);
        finalCommand = transformFindCommands(finalCommand);

        if (finalCommand !== command) {
          ctx.ui.notify(`Bash command transformed to: ${finalCommand}`, "info");
        }

        const newInput: ToolCallEvent["input"] = {
          ...event.input,
          command: finalCommand,
        };
        return newInput as any;
      }
    }
  );
}
