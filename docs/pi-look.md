# claude-code-style.ts — "pi look" extension

A small extension that restyles pi's TUI to a branded "Pi + Codex" look.

## What it does

- **Custom startup header** (`PiStartupHeader`): renders a branded box with a
  small animated logo (flash animation stops after the last frame), the
  headline "Let's build something great", the active model + thinking effort,
  and the current working directory (home paths shortened to `~`). On wide
  terminals a right-hand panel shows tips. Applied via `ctx.ui.setHeader()`.
- **Codex-style editor** (`CodexStyleEditor`): wraps the built-in input
  editor in a rounded border (`╭…╮` / `╰…╯`), via
  `ctx.ui.setEditorComponent()`.
- **Keeps pi's built-in footer and spinner** (explicitly
  `setFooter(undefined)` / `setWorkingIndicator(undefined)`).
- Applies automatically on `session_start` **in TUI mode only** (`ctx.mode !==
  "tui"` returns early, so print/RPC modes are untouched).

## Commands

| Command | Effect |
| --- | --- |
| `/pi-startup-look` | Apply the branded header + Codex-style editor immediately (also auto-applied on session start) |
| `/pi-look` | Restore pi's built-in header, footer, editor component, spinner, and title (`pi`) |

## Notes

- The logo animation runs on a timer; the component disposes it when replaced
  or when `/pi-look` is invoked (so no leaked intervals).
- The header renders a fallback (`Pi v<version>` in accent color) on terminals
  narrower than 24 columns.
- Imports from `@earendil-works/pi-coding-agent` / `@earendil-works/pi-tui`
  (unlike `coding-utils/`, which uses the `@mariozechner/*` package names).
