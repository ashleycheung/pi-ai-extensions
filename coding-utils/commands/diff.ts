import { type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  Editor,
  Key,
  matchesKey,
  truncateToWidth,
} from "@mariozechner/pi-tui";

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
      if (ctx.mode !== "tui") {
        ctx.ui.notify(stdout, "info");
        return;
      }

      // Show diff in a scrollable viewer with an optional comment input
      const comment = await ctx.ui.custom<string | undefined>(
        (tui, theme, _kb, done) => {
          // Split diff into lines for display
          const diffLines = stdout.split("\n");
          let scrollOffset = 0;
          let isInputMode = false;
          const maxEditorLines = 5;
          let cachedLines: string[] | undefined;
          let renderedWidth = 0;

          // Multi-line editor for comments
          const editor = new Editor(theme, _kb);
          editor.onSubmit = (text) => {
            if (text.trim()) {
              done(text);
            }
          };

          function refresh() {
            cachedLines = undefined;
            tui.requestRender();
          }

          function handleInput(data: string) {
            if (matchesKey(data, Key.escape)) {
              if (isInputMode) {
                isInputMode = false;
                refresh();
                return;
              }
              done(undefined);
              return;
            }

            if (matchesKey(data, Key.tab)) {
              isInputMode = !isInputMode;
              refresh();
              return;
            }

            if (isInputMode) {
              editor.handleInput(data);
              refresh();
              return;
            }

            // Scroll mode
            if (matchesKey(data, Key.up)) {
              scrollOffset = Math.max(0, scrollOffset - 1);
              refresh();
              return;
            }
            if (matchesKey(data, Key.down)) {
              const editorLineCount = Math.min(
                maxEditorLines,
                editor.getText()
                  ? Math.max(1, editor.getLines(renderedWidth - 2).length)
                  : 1
              );
              const inputAreaLines = 3 + editorLineCount;
              const viewportHeight = Math.max(
                1,
                tui.terminal.rows - 5 - inputAreaLines
              );
              const maxScroll = Math.max(
                0,
                diffLines.length - viewportHeight
              );
              scrollOffset = Math.min(maxScroll, scrollOffset + 1);
              refresh();
              return;
            }
          }

          // Colorize a diff line based on its prefix
          function colorDiffLine(line: string): string {
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
          }

          function render(width: number): string[] {
            if (cachedLines) return cachedLines;

            const renderWidth = Math.max(1, width);
            renderedWidth = renderWidth;

            // Calculate editor lines to determine viewport
            const editorLineCount = Math.min(
              maxEditorLines,
              editor.getText()
                ? Math.max(1, editor.getLines(renderWidth - 2).length)
                : 1
            );
            const inputAreaLines = 3 + editorLineCount;
            const viewportHeight = Math.max(
              1,
              tui.terminal.rows - 5 - inputAreaLines
            );
            const trunc = (line: string) => truncateToWidth(line, renderWidth);

            const lines: string[] = [];

            // Title
            const title = `📄 ${theme.fg("accent", theme.bold("Git Diff"))}`;
            lines.push(trunc(title));
            lines.push(trunc(theme.fg("dim", "─".repeat(renderWidth))));

            // Diff content (colorized)
            const visible = diffLines.slice(
              scrollOffset,
              scrollOffset + viewportHeight
            );
            for (const line of visible) {
              lines.push(trunc(colorDiffLine(line)));
            }

            // Scroll indicator
            const totalLines = diffLines.length;
            const maxScroll = Math.max(0, totalLines - viewportHeight);
            if (maxScroll > 0) {
              lines.push(trunc("─".repeat(renderWidth)));
              lines.push(
                trunc(
                  `↑↓ scroll • line ${scrollOffset + 1}-${Math.min(
                    scrollOffset + viewportHeight,
                    totalLines
                  )} of ${totalLines} • Esc to close`
                )
              );
            }

            // Input area
            lines.push(trunc("─".repeat(renderWidth)));
            const modeIndicator = isInputMode ? "🔤" : "💬";
            const hint = isInputMode
              ? "Enter to send • Shift+Enter newline • Tab/Esc to scroll"
              : "Tab to type comment • ↑↓ scroll • Esc to close";
            lines.push(trunc(`${modeIndicator}  ${hint}`));

            // Render editor content (with line limit)
            if (isInputMode || editor.getText()) {
              const editorWidth = Math.max(1, renderWidth - 2);
              const allEditorLines = editor.getLines(editorWidth);
              const visibleEditorLines = allEditorLines.slice(0, maxEditorLines);
              for (const line of visibleEditorLines) {
                lines.push(trunc(` ${line}`));
              }
              if (allEditorLines.length > maxEditorLines) {
                lines.push(
                  trunc(
                    ` ⤶ ${allEditorLines.length - maxEditorLines} more line${
                      allEditorLines.length - maxEditorLines !== 1 ? "s" : ""
                    }`
                  )
                );
              }
            } else {
              lines.push(trunc(" (press Tab to start typing)"));
            }

            cachedLines = lines;
            return lines;
          }

          return {
            render,
            invalidate: () => {
              cachedLines = undefined;
            },
            handleInput,
          };
        }
      );

      // If the user typed a comment, send it as a user message
      if (comment) {
        pi.sendUserMessage(comment);
      }
    },
  });
}
