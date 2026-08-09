/**
 * Shared scrollable viewer with an optional comment input.
 *
 * Renders a title + scrollable body (provided by the caller) with a
 * bottom input area:
 * - vim-style: press `i` to enter the comment input; Enter submits the
 *   comment, Shift+Enter adds a newline, Esc exits input mode (back to
 *   scroll mode) or closes the viewer.
 * - ↑/↓ scroll by one line, Ctrl+D/Ctrl+U scroll by half a viewport
 *   (vim-style) when not in input mode.
 * - When a `draftKey` is set, the comment text is kept session-only when the
 *   viewer closes without submitting and restored on the next open; it is
 *   cleared once a comment is submitted.
 * - The comment input renders through the pi Editor's own `render()` (the
 *   same render pi's main input editor uses) wrapped in a Codex-style rounded
 *   box (╭─╮ / ╰─╯) via the shared utils/box.ts helper, colored with the
 *   thinking-level border color like the main input editor. Because it reuses
 *   the editor's render, long lines word-wrap and the box expands as you type
 *   (up to the editor's max height, then scrolls internally keeping the
 *   cursor visible) — never truncated.
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
import {
  clearCommentDraft,
  getCommentDraft,
  saveCommentDraft,
} from "../store/comment-drafts";
import { roundBorderEdges } from "../utils/box";

/** Thinking-level string accepted by Theme.getThinkingBorderColor. */
type ThinkingLevel = Parameters<Theme["getThinkingBorderColor"]>[0];

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
  /**
   * When set, the comment text is saved when the viewer closes without
   * submitting and restored on the next open (session-only, per key).
   * Cleared when a comment is submitted. Keyed e.g. `plan:<cwd>:<planId>`.
   */
  draftKey?: string;
  /**
   * Thinking level used for the comment input's border color, matching the
   * main input editor (pi colors it via getThinkingBorderColor). Defaults to
   * "off" (dark gray).
   */
  thinkingLevel?: ThinkingLevel;
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
  let scrollOffset = 0;
  let isInputMode = false;
  let cachedLines: string[] | undefined;
  /** Editor box lines from the previous render (height feeds the viewport). */
  let cachedEditorLines: string[] | undefined;
  let renderedWidth = 0;

  // Multi-line editor for comments (Enter=submit, Shift+Enter=newline).
  // The published types declare (tui, theme, options); the bundled pi-tui
  // runtime matches. The viewer uses getText/handleInput and reuses the
  // editor's own render() (word-wrap + internal scroll), which is why this
  // construction is safe.
  const editor = new Editor(tui, theme as unknown as EditorTheme, {
    paddingX: 0,
  });

  // Restore a previously saved draft (session-only, per draftKey).
  const draftKey = options.draftKey;
  if (draftKey) {
    const draft = getCommentDraft(draftKey);
    if (draft) {
      editor.setText(draft);
    }
  }

  // Match the main input editor's border: the thinking-level border color
  // (same logic as pi's updateEditorBorderColor), "off" = dark gray.
  const inputBorderColor = theme.getThinkingBorderColor(
    options.thinkingLevel ?? "off"
  );
  // The editor draws its own borders; color them with the same thinking-level
  // border as the main input editor.
  editor.borderColor = inputBorderColor;

  editor.onSubmit = (text) => {
    if (text.trim()) {
      if (draftKey) {
        clearCommentDraft(draftKey);
      }
      done(text);
    }
  };

  /** Height of the scrollable body area in lines. */
  function getViewportHeight(): number {
    const editorBoxHeight = cachedEditorLines?.length ?? 0;
    // Fixed overhead (8) = title + title separator + scroll indicator (2) +
    // input separator + hint + slack (2). With the box shown this matches the
    // previous `rows - 10 - editorLineCount` (box = 2 borders + content).
    return Math.max(1, tui.terminal.rows - 8 - editorBoxHeight);
  }

  /** Scrolls the body by delta lines (negative = up), clamped to range. */
  function scrollBy(delta: number) {
    const viewportHeight = getViewportHeight();
    const bodyLines = options.renderBody(renderedWidth);
    const maxScroll = Math.max(0, bodyLines.length - viewportHeight);
    scrollOffset = Math.min(maxScroll, Math.max(0, scrollOffset + delta));
    refresh();
  }

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
      // Leaving without submitting: keep the current text as the draft
      // (empty text means the user cleared it, which deletes the draft).
      if (draftKey) {
        saveCommentDraft(draftKey, editor.getText());
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
      scrollBy(-1);
      return;
    }
    if (matchesKey(data, Key.down)) {
      scrollBy(1);
      return;
    }
    // Vim-style half-page scroll.
    if (matchesKey(data, Key.ctrl("d"))) {
      scrollBy(Math.max(1, Math.floor(getViewportHeight() / 2)));
      return;
    }
    if (matchesKey(data, Key.ctrl("u"))) {
      scrollBy(-Math.max(1, Math.floor(getViewportHeight() / 2)));
      return;
    }
  }

  function render(width: number): string[] {
    if (cachedLines) return cachedLines;

    const renderWidth = Math.max(1, width);
    renderedWidth = renderWidth;
    const trunc = (line: string) => truncateToWidth(line, renderWidth);

    // Render the comment input through the editor's own render (word-wrapping
    // + internal scroll keeping the cursor visible, like the main input).
    // No box (and no placeholder) until there is text or the user is typing.
    if (isInputMode || editor.getText()) {
      editor.focused = isInputMode;
      cachedEditorLines = roundBorderEdges(
        editor.render(renderWidth),
        renderWidth,
        inputBorderColor
      );
    } else {
      cachedEditorLines = undefined;
    }

    // Viewport height depends on the rendered editor box height.
    const viewportHeight = getViewportHeight();
    const bodyLines = options.renderBody(renderWidth);

    const lines: string[] = [];

    // Title
    lines.push(trunc(options.title));
    lines.push(trunc("─".repeat(renderWidth)));

    // Content
    const maxScroll = Math.max(0, bodyLines.length - viewportHeight);
    scrollOffset = Math.min(scrollOffset, maxScroll);
    const visible = bodyLines.slice(scrollOffset, scrollOffset + viewportHeight);
    for (const line of visible) {
      lines.push(trunc(line));
    }

    // Scroll indicator
    const totalLines = bodyLines.length;
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
      : "Press i to type comment • ↑↓ / Ctrl+D / Ctrl+U scroll • Esc to close";
    lines.push(trunc(`${modeIndicator}  ${hint}`));

    // Editor box (already bordered by the editor itself, edges rounded).
    if (cachedEditorLines) {
      for (const line of cachedEditorLines) {
        lines.push(trunc(line));
      }
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
