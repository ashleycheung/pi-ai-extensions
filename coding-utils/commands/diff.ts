import { type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createCommentViewer, isTuiMode } from "../utils/comment-viewer";

export function registerDiffCommand(pi: ExtensionAPI) {
  pi.registerCommand("diff", {
    description: "Show git diff output in chat",
    handler: async (args: string, ctx) => {
      // Build git diff args, appending any user-provided args
      const diffArgs = args ? ["diff", ...args.trim().split(/\s+/)] : ["diff"];

      // Execute via pi.exec (command and args are separate)
      let stdout: string;
      try {
        const result = await pi.exec("git", diffArgs, { cwd: ctx.cwd });
        stdout = result.stdout ?? "";
      } catch (err: any) {
        ctx.ui.notify(`git diff failed: ${err.message ?? err}`, "error");
        return;
      }

      // Handle empty diff
      if (!stdout.trim()) {
        ctx.ui.notify(
          "No diff output (working tree clean or no changes tracked by git)",
          "info"
        );
        return;
      }

      // If not in TUI mode, fall back to notify
      if (!isTuiMode(ctx)) {
        ctx.ui.notify(stdout, "info");
        return;
      }

      // Split diff into lines for display
      const diffLines = stdout.split("\n");

      // Show diff in a scrollable viewer with an optional comment input
      const comment = await ctx.ui.custom<string | undefined>(
        (tui, theme, kb, done) => {
          // Colorize a diff line based on its prefix
          const colorDiffLine = (line: string): string => {
            if (line.startsWith("+")) {
              return theme.fg("success", line);
            } else if (line.startsWith("-")) {
              return theme.fg("error", line);
            } else if (line.startsWith("@@")) {
              return theme.fg("accent", line);
            } else if (
              line.startsWith("diff --git") ||
              line.startsWith("index ") ||
              line.startsWith("---") ||
              line.startsWith("+++") ||
              line.startsWith("new file") ||
              line.startsWith("deleted file") ||
              line.startsWith("old mode") ||
              line.startsWith("new mode") ||
              line.startsWith("rename from") ||
              line.startsWith("rename to") ||
              line.startsWith("similarity index") ||
              line.startsWith("copy from") ||
              line.startsWith("copy to")
            ) {
              return theme.fg("muted", line);
            }
            return line;
          };

          return createCommentViewer(tui, theme, kb, done, {
            title: `📄 ${theme.fg("accent", theme.bold("Git Diff"))}`,
            renderBody: () => diffLines.map(colorDiffLine),
          });
        }
      );

      // If the user typed a comment, send it as a user message
      if (comment) {
        pi.sendUserMessage(comment);
      }
    },
  });
}
