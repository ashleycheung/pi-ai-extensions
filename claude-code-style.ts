import {
  CustomEditor,
  VERSION,
  type ExtensionAPI,
  type ExtensionContext,
  type KeybindingsManager,
} from "@earendil-works/pi-coding-agent";
import type { Component, EditorTheme, TUI } from "@earendil-works/pi-tui";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { padToWidth, roundBorderEdges } from "./coding-utils/utils/box";

const BRAND_RGB = "215;119;87";
const brand = (text: string) => `\x1b[38;2;${BRAND_RGB}m${text}\x1b[39m`;
const LEFT_PANEL_WIDTH = 42;
const LOGO_ANIMATION_INTERVAL_MS = 120;

// All lines padded to the same visible width so center() applies a uniform
// offset to the whole block and the legs stay tucked under the body.
const LOGO_LINES = [" ▐▛███▜▌ ", "▝▜█████▛▘", "  ▘▘ ▝▝  "];

const LOGO_FRAME_COUNT = 9;

function formatCwd(cwd: string): string {
  const home = process.env.HOME;
  return home && cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd;
}

function center(text: string, width: number): string {
  if (width <= 0) return "";
  const w = visibleWidth(text);
  if (w >= width) return truncateToWidth(text, width, "");
  return `${" ".repeat(Math.floor((width - w) / 2))}${text}`;
}

function piLogoFrame(frameIndex: number): string[] {
  const f = frameIndex % LOGO_FRAME_COUNT;
  const flash = f === 1 || f === 3;
  const color = flash ? "\x1b[97m" : `\x1b[38;2;${BRAND_RGB}m`;
  const reset = "\x1b[39m";
  return LOGO_LINES.map((line) => `${color}${line}${reset}`);
}

function borderLine(
  left: string,
  label: string,
  right: string,
  width: number
): string {
  if (width <= 1) return "";
  if (width < 8 || label.length === 0)
    return brand(
      truncateToWidth(
        left + "─".repeat(Math.max(0, width - 2)) + right,
        width,
        ""
      )
    );

  const before = "─── ";
  const after = " ─────";
  const fixedWidth =
    visibleWidth(before) + visibleWidth(label) + visibleWidth(after);
  const fill = Math.max(0, width - 2 - fixedWidth);
  return `${brand(left)}${brand(before)}${label}${brand(after)}${brand(
    "─".repeat(fill)
  )}${brand(right)}`;
}

function boxedLine(content: string, width: number): string {
  if (width <= 2) return truncateToWidth(content, width, "");
  return `${brand("│")}${padToWidth(content, width - 2)}${brand("│")}`;
}

function twoColumn(
  left: string,
  right: string,
  leftWidth: number,
  rightWidth: number
): string {
  return `${padToWidth(left, leftWidth)} ${brand("│")} ${padToWidth(
    right,
    rightWidth
  )}`;
}

class PiStartupHeader implements Component {
  private frame = 0;
  private readonly timer: NodeJS.Timeout;

  constructor(
    private readonly pi: ExtensionAPI,
    private readonly ctx: ExtensionContext,
    private readonly tui: TUI
  ) {
    this.timer = setInterval(() => {
      if (this.frame < LOGO_FRAME_COUNT - 1) {
        this.frame++;
        this.tui.requestRender();
      } else {
        clearInterval(this.timer);
      }
    }, LOGO_ANIMATION_INTERVAL_MS);
    this.timer.unref?.();
  }

  render(width: number): string[] {
    if (width < 24) return [this.ctx.ui.theme.fg("accent", `Pi v${VERSION}`)];

    const theme = this.ctx.ui.theme;
    const muted = (s: string) => theme.fg("muted", s);
    const dim = (s: string) => theme.fg("dim", s);
    const bold = (s: string) => theme.bold(s);

    const innerWidth = width - 2;
    const leftWidth = Math.min(LEFT_PANEL_WIDTH, innerWidth);
    const rightWidth = Math.max(0, innerWidth - leftWidth - 3);
    const useTips = rightWidth >= 24;
    const model = this.ctx.model?.id ?? "Default model";
    const effort = this.pi.getThinkingLevel();
    const cwd = formatCwd(this.ctx.cwd);

    const leftLines = [
      ...piLogoFrame(this.frame).map((line) => center(line, leftWidth)),
      center(bold("Let's build something great"), leftWidth),
      center(muted(`${model} with ${effort} effort`), leftWidth),
      center(dim(cwd), leftWidth),
    ];

    const tipLines = [
      "",
      brand(bold("This is your own agent harness")),
      muted("Ask Pi to build it"),
      brand("──────────────────────"),
      brand(bold("AI Slop Cannon!")),
      muted("Vroommmm - Proompting timeee!!"),
    ];

    const lines = [borderLine("╭", `${brand("Pi")} v${VERSION}`, "╮", width)];
    for (let i = 0; i < leftLines.length; i++) {
      const content = useTips
        ? twoColumn(
            leftLines[i] ?? "",
            tipLines[i] ?? "",
            leftWidth,
            rightWidth
          )
        : padToWidth(leftLines[i] ?? "", leftWidth);
      lines.push(boxedLine(content, width));
    }
    lines.push(borderLine("╰", "", "╯", width));
    return lines.map((line) => truncateToWidth(line, width, ""));
  }

  invalidate(): void {}

  dispose(): void {
    clearInterval(this.timer);
  }
}

class CodexStyleEditor extends CustomEditor {
  constructor(tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager) {
    super(tui, theme, keybindings, { paddingX: 1 });
  }

  // Shared with the plan/diff viewer comment input (coding-utils/utils/box.ts).
  // The editor's own render already emits `─` top/bottom edges, so only the
  // edges get rounded (replaced), keeping scroll-indicator borders intact.
  render(width: number): string[] {
    return roundBorderEdges(
      super.render(width),
      width,
      (s) => this.borderColor(s)
    );
  }
}

let activePiStartupHeader: PiStartupHeader | undefined;

function applyPiLook(pi: ExtensionAPI, ctx: ExtensionContext): void {
  if (ctx.mode !== "tui") return;

  ctx.ui.setTitle("Pi");
  ctx.ui.setHeader((tui) => {
    activePiStartupHeader?.dispose();
    activePiStartupHeader = new PiStartupHeader(pi, ctx, tui);
    return activePiStartupHeader;
  });
  ctx.ui.setFooter(undefined); // keep pi's original footer
  ctx.ui.setWorkingIndicator(undefined); // keep pi's original spinner
  ctx.ui.setEditorComponent(
    (tui, theme, keybindings) => new CodexStyleEditor(tui, theme, keybindings)
  );
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    applyPiLook(pi, ctx);
  });

  pi.registerCommand("pi-startup-look", {
    description: "Apply the Pi startup header with a Codex-style input box",
    handler: async (_args, ctx) => {
      applyPiLook(pi, ctx);
      ctx.ui.notify("Pi startup look applied", "info");
    },
  });

  pi.registerCommand("pi-look", {
    description:
      "Restore pi's built-in TUI header, footer, editor, and spinner",
    handler: async (_args, ctx) => {
      activePiStartupHeader?.dispose();
      activePiStartupHeader = undefined;
      ctx.ui.setTitle("pi");
      ctx.ui.setHeader(undefined);
      ctx.ui.setFooter(undefined);
      ctx.ui.setWorkingIndicator(undefined);
      ctx.ui.setEditorComponent(undefined);
      ctx.ui.notify("Built-in pi look restored", "info");
    },
  });
}
