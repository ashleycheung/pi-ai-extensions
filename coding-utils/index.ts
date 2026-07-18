/**
 * This extension add some code utils to make programming easier
 */
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  truncateHead,
  type ExtensionAPI,
  type ToolCallEvent,
  type ToolCallEventResult,
  withFileMutationQueue,
} from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { isSafeCommand } from "./utils";

const IGNORE_DIRS = ["node_modules", "dist", "build"];

enum AIMode {
  None = "none",
  Execute = "execute",
  Plan = "plan",
}
let mode = AIMode.None;
let hasSentInitialModeMessage = false;
let showModeMessage = false;
const modeWidget = "ai-mode-widget";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("showmodemessage", {
    description: "Shows the message injected at the start of each mode",
    handler: async (args, ctx) => {
      showModeMessage = true;
      ctx.ui.notify(`Show Mode Message set to true`, "info");
    },
  });
  pi.registerCommand("hidemodemessage", {
    description: "Hides the message injected at the start of each mode",
    handler: async (args, ctx) => {
      showModeMessage = false;
      ctx.ui.notify(`Show Mode Message set to false`, "info");
    },
  });
  pi.registerCommand("execute", {
    description: "Changes to execute mode",
    handler: async (args, ctx) => {
      ctx.ui.setWidget(modeWidget, [hexAnsi("#ED64A6")("Execute Mode")], {
        placement: "aboveEditor",
      });
      mode = AIMode.Execute;
      hasSentInitialModeMessage = false;
      ctx.ui.notify(`Changed to Execute Mode`, "info");
    },
  });
  pi.registerCommand("plan", {
    description: "Changes to plan mode",
    handler: async (args, ctx) => {
      ctx.ui.setWidget(modeWidget, [hexAnsi("#ED8936")("Plan Mode")], {
        placement: "aboveEditor",
      });
      mode = AIMode.Plan;
      hasSentInitialModeMessage = false;
      ctx.ui.notify(`Changed to Plan Mode`, "info");
    },
  });
  pi.on("before_agent_start", async () => {
    switch (mode) {
      case AIMode.Execute: {
        if (!hasSentInitialModeMessage) {
          hasSentInitialModeMessage = true;
          return {
            message: {
              customType: "Execute Mode",
              content: `
                You are in Execute Mode and you MUST execute on a task.
                You MUST breakdown your task into smaller actionable tasks.
                You MUST use TaskCreate and TaskUpdate to keep track of your progress.
                When exploring the codebase, you MUST use an Explore Agent via the Agent tool
              `,
              display: showModeMessage,
            },
          };
        }
        break;
      }
      case AIMode.Plan: {
        if (!hasSentInitialModeMessage) {
          hasSentInitialModeMessage = true;
          return {
            message: {
              customType: "Plan Mode",
              content: `
                You are in Plan Mode and you are to draft a plan.
                You MUST NOT make any file changes.
                All your actions, commands, and scripts MUST be readonly.
                When drafting this plan:
                  - You MUST NOT make any edits
                  - When exploring the codebase, you MUST use an Explore Agent via the Agent tool.
                  - If there are any ambiguities in the plan, you MUST clarify with the user.
                  - When your plan is complete, you MUST ask the user if they would like to execute on the plan.
              `,
              display: showModeMessage,
            },
          };
        }
        // Nudges
        return {
          message: {
            customType: "Plan Mode Nudge",
            content: `
                You are in Plan Mode.
                You MUST NOT make any edits or file changes
              `,
          },
          display: showModeMessage,
        };
      }
    }
  });
  pi.registerTool({
    name: "search_files",
    label: "Search files",
    description:
      "Searches for files that has filename matching the search string",
    promptSnippet:
      "Searches the for files that has filename matching the search string",
    promptGuidelines: [
      "You **MUST** use 'search_files' tool to search for files with a filename matching the given search string",
    ],
    parameters: Type.Object({
      searchText: Type.String(),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx): Promise<any> {
      // Check for cancellation
      if (signal?.aborted) {
        return { content: [{ type: "text", text: "Cancelled" }] };
      }

      // Stream progress updates
      onUpdate?.({
        content: [{ type: "text", text: "Searching files" }],
        details: { progress: 50 },
      });

      const result = await pi.exec("fd", [params.searchText]);

      const output = result.stdout.trim();
      if (!output) {
        if (result.code !== 0) {
          const err =
            result.stderr.trim() || `fd exited with code ${result.code}`;
          return { content: [{ type: "text", text: `Search failed: ${err}` }] };
        }
        return {
          content: [{ type: "text", text: "No files found matching pattern" }],
        };
      }

      const resultText = await handleTruncation(result.stdout);

      return { content: [{ type: "text", text: resultText }] };
    },
  });
  pi.registerTool({
    name: "search_codebase",
    label: "Search Codebase",
    description: "Searches the codebase for a particular text",
    promptSnippet: "Searches the codebase for a particular text",
    promptGuidelines: [
      "You **MUST** use 'search_codebase' tool to search the codebase for a particular text",
    ],
    parameters: Type.Object({
      searchText: Type.String(),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx): Promise<any> {
      // Check for cancellation
      if (signal?.aborted) {
        return { content: [{ type: "text", text: "Cancelled" }] };
      }

      // Stream progress updates
      onUpdate?.({
        content: [{ type: "text", text: "Searching codebase..." }],
        details: { progress: 50 },
      });

      const result = await pi.exec("rg", [params.searchText]);

      // ripgrep exits 1 with empty stdout when there are no matches (not an error)
      const output = result.stdout.trim();
      if (!output) {
        if (result.code !== 0 && result.code !== 1) {
          const err =
            result.stderr.trim() || `ripgrep exited with code ${result.code}`;
          return { content: [{ type: "text", text: `Search failed: ${err}` }] };
        }
        return { content: [{ type: "text", text: "No matches found" }] };
      }

      const resultText = await handleTruncation(result.stdout);

      return { content: [{ type: "text", text: resultText }] };
    },
  });

  // Check tool calls
  pi.on(
    "tool_call" as any,
    async (event: ToolCallEvent, ctx): Promise<ToolCallEventResult | void> => {
      switch (event.toolName) {
        // Bash tool
        case "bash": {
          if (
            mode === AIMode.Plan &&
            !isSafeCommand(String(event.input.command))
          ) {
            return {
              block: true,
              reason: `
              You are in Plan Mode.
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
          if (mode === AIMode.Plan) {
            return {
              block: true,
              reason: `
              You are in Plan Mode.
              Edits are strictly NOT allowed.
              You must explicitly ask the user to change to execute mode to enable file editing`,
            };
          }
        }
      }
    }
  );
}

// ╔══════════════════════════════════╗
// ║        Utility Functions         ║
// ╚══════════════════════════════════╝

/**
 * Truncates a really long response
 */
async function handleTruncation(contents: string) {
  // Apply truncation
  const truncation = truncateHead(contents, {
    maxLines: DEFAULT_MAX_LINES,
    maxBytes: DEFAULT_MAX_BYTES,
  });

  let resultText = truncation.content;

  if (truncation.truncated) {
    // Save full output to a temp file so LLM can access it if needed
    const tempDir = await mkdtemp(join(tmpdir(), "pi-rg-"));
    const tempFile = join(tempDir, "output.txt");
    await withFileMutationQueue(tempFile, async () => {
      await writeFile(tempFile, contents, "utf8");
    });

    // Add truncation notice - this helps the LLM understand the output is incomplete
    const truncatedLines = truncation.totalLines - truncation.outputLines;
    const truncatedBytes = truncation.totalBytes - truncation.outputBytes;

    resultText += `\n\n[Output truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines`;
    resultText += ` (${formatSize(truncation.outputBytes)} of ${formatSize(
      truncation.totalBytes
    )}).`;
    resultText += ` ${truncatedLines} lines (${formatSize(
      truncatedBytes
    )}) omitted.`;
    resultText += ` Full output saved to: ${tempFile}]`;
  }
  return resultText;
}

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

function hexAnsi(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  return (text: string) => `\x1b[38;2;${r};${g};${b}m${text}\x1b[0m`;
}
