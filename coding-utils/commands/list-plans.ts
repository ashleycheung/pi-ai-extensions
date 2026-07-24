import {
  getMarkdownTheme,
  type ExtensionAPI,
} from "@mariozechner/pi-coding-agent";
import {
  Editor,
  Key,
  Markdown,
  matchesKey,
  truncateToWidth,
} from "@mariozechner/pi-tui";
import {
  listPlans,
  getPlan,
  deletePlan,
  getPlanTitle,
  formatRelativeTime,
} from "../utils/plans";

export function registerListPlansCommand(pi: ExtensionAPI) {
  pi.registerCommand("list_plans", {
    description: "Lists all plans in an interactive selector",
    handler: async (args, ctx) => {
      const plans = await listPlans(ctx.cwd);

      if (plans.length === 0) {
        ctx.ui.notify("No plans found", "info");
        return;
      }

      const optionToId = new Map<string, string>();
      const options = [
        ...plans.map((p) => {
          const label = `${p.title} — ${formatRelativeTime(p.updatedAt)}`;
          optionToId.set(label, p.id);
          return label;
        }),
        "Exit",
      ];

      const selected = await ctx.ui.select("📋 Plans", options);

      if (!selected || selected === "Exit") {
        ctx.ui.notify("Plan selection cancelled", "info");
        return;
      }

      // Look up plan ID from the selected option label
      const planId = optionToId.get(selected);
      const plan = plans.find((p) => p.id === planId);
      const planTitle = plan?.title ?? planId;

      const planContent = await getPlan(ctx.cwd, planId);
      if (planContent === undefined) {
        ctx.ui.notify(`Plan "${planId}" not found`, "error");
        return;
      }

      if (ctx.mode !== "tui") {
        ctx.ui.notify(
          `Plan "${planTitle}" (${planId}):\n\n${planContent}`,
          "info"
        );
        return;
      }

      // Show plan content in a scrollable markdown viewer starting at the top
      const comment = await ctx.ui.custom<string | undefined>(
        (tui, theme, _kb, done) => {
          const markdownTheme = getMarkdownTheme(theme);
          const markdown = new Markdown(
            planContent,
            0, // paddingX
            0, // paddingY
            markdownTheme
          );
          let scrollOffset = 0;
          let isInputMode = false;
          const maxEditorLines = 5;
          let cachedLines: string[] | undefined;
          let renderedWidth = 0;

          // Multi-line editor for comments (handles Enter=submit, Shift+Enter=newline)
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
                markdown.render(renderedWidth).length - viewportHeight
              );
              scrollOffset = Math.min(maxScroll, scrollOffset + 1);
              refresh();
              return;
            }
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

            // Re-render markdown at the current width
            markdown.invalidate();
            const fullLines = markdown.render(renderWidth);

            const lines: string[] = [];

            // Title
            const title = `📄 ${planTitle}  (${planId})`;
            lines.push(trunc(title));
            lines.push(trunc("─".repeat(renderWidth)));

            // Content (rendered by Markdown component)
            const visible = fullLines.slice(
              scrollOffset,
              scrollOffset + viewportHeight
            );
            for (const line of visible) {
              lines.push(trunc(line));
            }

            // Scroll indicator
            const totalLines = fullLines.length;
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
              const visibleEditorLines = allEditorLines.slice(
                0,
                maxEditorLines
              );
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

      if (comment) {
        const planPrefix = `[Plan: ${planId}]\n\n`;
        pi.sendUserMessage(`${planPrefix}${comment}`);
      }
    },
  });
}
