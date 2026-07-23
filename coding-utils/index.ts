import { type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerModeCommands, registerBeforeAgentStartHandler } from "./mode";
import { registerPlanCommands } from "./plan-commands";
import { registerPlanTools } from "./plan-tools";
import { registerCommandSafetyHandler } from "./command-safety";
import { Type } from "typebox";
import { handleTruncation } from "./truncation";

export default function (pi: ExtensionAPI) {
  registerModeCommands(pi);
  registerBeforeAgentStartHandler(pi);
  registerPlanCommands(pi);
  registerPlanTools(pi);
  registerCommandSafetyHandler(pi);
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
}
