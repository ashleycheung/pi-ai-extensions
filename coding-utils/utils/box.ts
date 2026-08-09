/**
 * Reusable box-drawing helpers for TUI text layouts.
 *
 * Provides the Codex-style rounded border used by the plan/diff comment input
 * (utils/comment-viewer.ts) and by the main input editor styled in
 * extensions/claude-code-style.ts: `roundBorderEdges` rounds the top/bottom
 * edges of an already-bordered render (the pi Editor's own `─` borders) into
 * `╭─…─╮` / `╰─…─╯`. Pure — no `pi` or `ctx` dependencies, so it stays in
 * utils/ per the repo conventions.
 */
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

/** Pads text to the given visible width, clipping it if longer. */
export function padToWidth(text: string, width: number): string {
  const clipped = truncateToWidth(text, width, "");
  return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}

/** Builds one border row (rounded corners + fill) colored by `border`. */
function borderRow(
  left: string,
  right: string,
  width: number,
  border: (s: string) => string
): string {
  return border(`${left}${"─".repeat(Math.max(0, width - 2))}${right}`);
}

/**
 * Rounds the first/last lines of an already-bordered render (e.g. the main
 * input editor's own `─` edges) into `╭─…─╮` / `╰─…─╯` and pads all lines to
 * the full width. For a single line, wraps it in both borders instead of
 * replacing it (out[0] === out[out.length - 1] for one element).
 */
export function roundBorderEdges(
  lines: string[],
  width: number,
  border: (s: string) => string
): string[] {
  if (lines.length === 0 || width < 4) return lines;
  if (lines.length === 1) {
    return [
      borderRow("╭", "╮", width, border),
      padToWidth(lines[0], width),
      borderRow("╰", "╯", width, border),
    ];
  }
  const out = [...lines];
  out[0] = borderRow("╭", "╮", width, border);
  out[out.length - 1] = borderRow("╰", "╯", width, border);
  return out.map((line) => padToWidth(line, width));
}
