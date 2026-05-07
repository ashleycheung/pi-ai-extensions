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
  pi.registerTool({
    name: "get_folder_structure",
    label: "Get Folder Structure",
    description:
      "Gets the filestructure of a folder. This will give you the recursive folder structure of the given folder",
    promptSnippet: "Gets the folder structure",
    promptGuidelines: [
      "Use this tool to get a summary of the folder structure of a given folder. Use this to get folder summaries of codebases",
    ],
    parameters: Type.Object({
      folderPath: Type.String(),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx): Promise<any> {
      // Check for cancellation
      if (signal?.aborted) {
        return { content: [{ type: "text", text: "Cancelled" }] };
      }

      // Stream progress updates
      onUpdate?.({
        content: [{ type: "text", text: "Getting folder structure..." }],
        details: { progress: 50 },
      });

      const result = await pi.exec("fd", [
        "-t",
        "d",
        ".",
        params.folderPath ?? ".",
      ]);

      const buildTree = (paths: string[]): string => {
        const tree: Record<string, any> = {};

        for (const path of paths) {
          const parts = path.replace(/\/$/, "").split("/");
          let node = tree;
          for (const part of parts) {
            node[part] = node[part] ?? {};
            node = node[part];
          }
        }

        const render = (node: Record<string, any>, indent = 0): string => {
          return Object.keys(node)
            .map((key) => {
              const prefix = "  ".repeat(indent) + "- ";
              const children = render(node[key], indent + 1);
              return prefix + key + (children ? "\n" + children : "");
            })
            .join("\n");
        };

        return render(tree);
      };

      const paths = result.stdout.trim().split("\n").filter(Boolean);
      const tree = buildTree(paths);

      // Apply truncation
      const truncation = truncateHead(tree, {
        maxLines: DEFAULT_MAX_LINES,
        maxBytes: DEFAULT_MAX_BYTES,
      });

      let resultText = truncation.content;

      if (truncation.truncated) {
        // Save full output to a temp file so LLM can access it if needed
        const tempDir = await mkdtemp(join(tmpdir(), "pi-rg-"));
        const tempFile = join(tempDir, "output.txt");
        await withFileMutationQueue(tempFile, async () => {
          await writeFile(tempFile, tree, "utf8");
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

      return { content: [{ type: "text", text: resultText }] };
    },
  });

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
