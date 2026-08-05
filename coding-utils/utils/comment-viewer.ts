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
 * - The comment input renders as a Codex-style rounded box (╭─╮ / ╰─╯ with
 *   padding, no side pipes) via the shared utils/box.ts helper, colored with
 *   the thinking-level border color like pi's main input editor. While typing,
 *   the cursor is shown the same way as the main editor (inverse-video block
 *   via renderCursor).
 *
 * Used by the diff, readplan, and list_plans commands. Pure — no `pi` or
 * `ctx` dependencies, so it stays in utils/ per the repo conventions.
 */
import {
  type Component,
  CURSOR_MARKER,
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
import { applyRoundedBorder } from "../utils/box";

/** Thinking-level string accepted by Theme.getThinkingBorderColor. */
type ThinkingLevel = Parameters<Theme["getThinkingBorderColor"]>[0];

/** Grapheme segmentation for cursor rendering (matches the main editor). */
const graphemeSegmenter = new Intl.Segmenter(undefined, {
  granularity: "grapheme",
});

/**
 * Renders the main editor's cursor into a text line at the given column:
 * inverse-video on the grapheme under the cursor (or a highlighted space at
 * end of line), with the zero-width CURSOR_MARKER before it so the TUI can
 * position the hardware cursor (IME support).
 */
function renderCursor(line: string, col: number): string {
  const clamped = Math.max(0, Math.min(col, line.length));
  const after = line.slice(clamped);
  if (after.length > 0) {
    const first = [...graphemeSegmenter.segment(after)][0]?.segment ?? "";
    return `${line.slice(0, clamped)}${CURSOR_MARKER}\x1b[7m${first}\x1b[0m${after.slice(first.length)}`;
  }
  return `${line}${CURSOR_MARKER}\x1b[7m \x1b[0m`;
}

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
    const editorLineCount = Math.min(
      maxEditorLines,
      editor.getText() ? Math.max(1, editor.getLines().length) : 1
    );
    const inputAreaLines = 3 + editorLineCount;
    // Fixed overhead (7) = title + title separator + scroll indicator (2) +
    // input separator + hint + the input box's 2 border rows.
    return Math.max(1, tui.terminal.rows - 7 - inputAreaLines);
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

    // Calculate editor lines to determine viewport
    const viewportHeight = getViewportHeight();
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
      : "Press i to type comment • ↑↓ / Ctrl+D / Ctrl+U scroll • Esc to close";
    lines.push(trunc(`${modeIndicator}  ${hint}`));

    // Render editor content (with line limit), boxed Codex-style.
    // No box (and no placeholder) until there is text or the user is typing.
    const content: string[] = [];
    if (isInputMode || editor.getText()) {
      const allEditorLines = editor.getLines();
      const visibleEditorLines = allEditorLines.slice(0, maxEditorLines);
      // Logical cursor position (indexes getLines()) to render while typing.
      const cursor = isInputMode ? editor.getCursor() : null;
      for (let i = 0; i < visibleEditorLines.length; i++) {
        let line = ` ${visibleEditorLines[i]}`;
        if (cursor && cursor.line === i) {
          // +1 accounts for the leading space added above.
          line = renderCursor(line, cursor.col + 1);
        }
        content.push(line);
      }
      if (allEditorLines.length > maxEditorLines) {
        content.push(
          ` ⤶ ${allEditorLines.length - maxEditorLines} more line${
            allEditorLines.length - maxEditorLines !== 1 ? "s" : ""
          }`
        );
      }
    }
    const bordered = applyRoundedBorder(content, renderWidth, inputBorderColor);
    for (const line of bordered) {
      lines.push(trunc(line));
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
