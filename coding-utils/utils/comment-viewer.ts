/**
 * Shared scrollable viewer with an optional comment input.
 *
 * Renders a title + scrollable body (provided by the caller) with a
 * bottom input area:
 * - vim-style: press `i` to enter the comment input; Enter submits the
 *   comment, Shift+Enter adds a newline, Esc exits input mode (back to
 *   scroll mode) or closes the viewer.
 * - ↑/↓ scroll the body when not in input mode.
 *
 * Used by the diff, readplan, and list_plans commands. Pure — no `pi` or
 * `ctx` dependencies, so it stays in utils/ per the repo conventions.
 */
import {
  type Component,
  Editor,
  type EditorTheme,
  Key,
  type KeybindingsManager,
  matchesKey,
  truncateToWidth,
  type TUI,
} from "@mariozechner/pi-tui";
import {
  type ExtensionCommandContext,
  type Theme,
} from "@mariozechner/pi-coding-agent";

/**
 * Whether the current context is the interactive TUI (the viewer can render).
 * `ctx.mode` exists at runtime but isn't declared on the published
 * command-context types, so it's accessed via a narrow cast (same pattern the
 * original diff command used).
 */
export function isTuiMode(ctx: ExtensionCommandContext): boolean {
  return (ctx as ExtensionCommandContext & { mode?: string }).mode === "tui";
}

export interface CommentViewerOptions {
  /** Title line shown at the top (may include ANSI styling). */
  title: string;
  /**
   * Returns the full (unwrapped) body lines to scroll through for the given
   * viewport width. Called on every re-render after invalidation; callers
   * that render markdown should invalidate + re-render inside here.
   */
  renderBody: (width: number) => string[];
  /** Maximum visible lines of the comment editor. Defaults to 5. */
  maxEditorLines?: number;
}

/**
 * Creates the viewer component. Hand over the returned object to
 * `ctx.ui.custom(...)`; `done` is called with the submitted comment text
 * or `undefined` when closed without submitting.
 */
export function createCommentViewer(
  tui: TUI,
  theme: Theme,
  keybindings: KeybindingsManager,
  done: (result: string | undefined) => void,
  options: CommentViewerOptions
): Component & { invalidate(): void } {
  const maxEditorLines = options.maxEditorLines ?? 5;
  let scrollOffset = 0;
  let isInputMode = false;
  let cachedLines: string[] | undefined;
  let renderedWidth = 0;

  // Multi-line editor for comments (Enter=submit, Shift+Enter=newline).
  // The published types declare (tui, theme, options); the bundled pi-tui
  // runtime matches. The viewer only exercises getText/getLines/handleInput
  // (never render()/autocomplete), which is why this construction is safe.
  const editor = new Editor(tui, theme as unknown as EditorTheme, {
    paddingX: 0,
  });
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

    if (isInputMode) {
      editor.handleInput(data);
      refresh();
      return;
    }

    // Scroll mode: vim-style `i` enters the comment input.
    if (matchesKey(data, "i")) {
      isInputMode = true;
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
        editor.getText() ? Math.max(1, editor.getLines().length) : 1
      );
      const inputAreaLines = 3 + editorLineCount;
      const viewportHeight = Math.max(
        1,
        tui.terminal.rows - 5 - inputAreaLines
      );
      const bodyLines = options.renderBody(renderedWidth);
      const maxScroll = Math.max(0, bodyLines.length - viewportHeight);
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
      editor.getText() ? Math.max(1, editor.getLines().length) : 1
    );
    const inputAreaLines = 3 + editorLineCount;
    const viewportHeight = Math.max(
      1,
      tui.terminal.rows - 5 - inputAreaLines
    );
    const trunc = (line: string) => truncateToWidth(line, renderWidth);

    const bodyLines = options.renderBody(renderWidth);

    const lines: string[] = [];

    // Title
    lines.push(trunc(options.title));
    lines.push(trunc("─".repeat(renderWidth)));

    // Content
    const visible = bodyLines.slice(scrollOffset, scrollOffset + viewportHeight);
    for (const line of visible) {
      lines.push(trunc(line));
    }

    // Scroll indicator
    const totalLines = bodyLines.length;
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
      ? "Enter to send • Shift+Enter newline • Esc to exit"
      : "Press i to type comment • ↑↓ scroll • Esc to close";
    lines.push(trunc(`${modeIndicator}  ${hint}`));

    // Render editor content (with line limit)
    if (isInputMode || editor.getText()) {
      const allEditorLines = editor.getLines();
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
      lines.push(trunc(" (press i to start typing)"));
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
