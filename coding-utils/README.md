# coding-utils

A pi coding-agent extension that provides mode management
(Normal/Execute/Plan/Ask/Code Review), plan CRUD tools, plan interactive
commands, and codebase search tools.

## Folder structure

```
coding-utils/
├── index.ts               # Entry point — import and register everything
├── commands/              # One file per pi.registerCommand() call
│   ├── show-mode-message.ts
│   ├── hide-mode-message.ts
│   ├── execute.ts
│   ├── plan.ts
│   ├── ask.ts
│   ├── code-review.ts
│   ├── normal.ts
│   ├── mode-cycle.ts     # Shift+Tab cycles Normal → Plan → Execute → Ask → Code Review
│   ├── diff.ts           # TUI diff viewer (shared comment viewer)
│   ├── list-plans.ts      # TUI-heavy plan viewer with comment editor
│   ├── read-plan.ts        # Shows latest plan (viewer window or notification)
│   ├── codereview-plan.ts # Select plan → Code Review Mode + inject review prompt
│   ├── toggle-plan-output.ts # Toggles plan output between viewer window and notification
│   └── delete-plan.ts
├── tools/                 # One file per pi.registerTool() call
│   ├── search-files.ts
│   ├── search-codebase.ts
│   ├── plan-get.ts
│   ├── plan-list.ts
│   ├── plan-create.ts
│   ├── plan-edit.ts
│   └── plan-delete.ts
├── events/                # Event handler registrations
│   ├── before-agent-start.ts   # Injects mode instructions into agent prompts
│   └── command-safety.ts       # Blocks destructive commands in Plan/Ask modes
├── store/                 # Shared state and constants
│   ├── mode-state.ts      # modeState object (mode, hasSentInitialModeMessage, showModeMessage)
│   ├── plan-output-state.ts # planOutputState (viewer/notify) + persistence to ~/.pi/agent/
│   └── mode-messages.ts   # AIMode enum, MODE_META (label/color), cycle order, mode prompts
└── utils/                 # Pure utility functions (no side effects)
    ├── plans.ts           # Plan CRUD (file I/O for .pi/plans/ directory)
    ├── comment-viewer.ts  # Shared scrollable viewer with comment input (diff/readplan/list_plans)
    ├── set-mode.ts        # Shared setMode() — widget + state + notify for all mode switches
    ├── format.ts          # hexAnsi color conversion
    ├── transform.ts       # grep/find command transformers (skip node_modules/dist/build)
    ├── truncation.ts      # Long output truncation with temp file fallback
    └── command-patterns.ts # Safe/destructive bash command pattern matching
```

## Conventions

- **One file per registration** — Every `pi.registerCommand()` or `pi.registerTool()` call lives in its own file under `commands/` or `tools/`. The export is always a single `register*` function (e.g. `registerExecuteCommand`, `registerPlanGetTool`).
- **Events go in `events/`** — `pi.on()` handlers are registered from files in `events/`. Each file exports a single `register*` function.
- **Shared state goes in `store/`** — Cross-module state is kept in a mutable object pattern (`export const modeState = { ... }`) to ensure visibility under CommonJS transpilation. Never use `export let` for shared mutable state.
- **Pure functions go in `utils/`** — No side effects, no `pi` or `ctx` dependencies. These are testable building blocks.

## Adding a new command

1. Create `commands/your-command.ts`
2. Export `registerYourCommand(pi: ExtensionAPI)`
3. Call it from `index.ts`

## Behavior overview

See the repo-root `docs/` folder for a full behavior reference (`docs/coding-utils.md`, `docs/pi-look.md`).

Key behaviors:

- **Mode switching**: `/normal`, `/plan`, `/execute`, `/ask`, `/codereview` change the AI mode (widget + prompt injection). **Shift+Tab** cycles through all modes starting at Normal (Normal → Plan → Execute → Ask → Code Review, wrapping). Requires `app.thinking.cycle` unbound in `~/.pi/agent/keybindings.json` (the extension writes `{"app.thinking.cycle": []}` on install; `/reload` after editing).
- **Plan output modes**: `readplan` / `list_plans` show plan content either in an interactive **viewer window** (scroll with ↑/↓ or Ctrl+D / Ctrl+U half-page, press `i` to type a comment — vim-style, Enter sends it as a user message prefixed `[Plan: <id>]`, Esc exits; the comment input is a Codex-style bordered box shared with `claude-code-style.ts`, colored like the main input editor (thinking-level border); it reuses the main editor's render, so long lines word-wrap and the box expands as you type (then scrolls internally, keeping the cursor visible — never truncated); the comment text is kept as a session-only draft per plan and restored on reopen, cleared on submit) or as a **notification**. `/toggle_plan_output` switches between them; the choice is persisted to `<agentDir>/plan-output-mode.json` and defaults to the viewer.
- **Plan mode safety**: in Plan/Ask/Code Review modes, `bash` commands are allowlisted (`utils/command-patterns.ts`); harmless redirects and `git -C` prefixes are normalized, compound commands are split, and only known read-only commands pass. `edit` is blocked in those modes; `plan_create`/`plan_edit`/`plan_delete` are blocked in Ask/Code Review.
- **plan_edit matching**: exact match first, then an escape-unescaped fallback; failures include a tail of the plan file.

## Adding a new tool

1. Create `tools/your-tool.ts`
2. Export `registerYourTool(pi: ExtensionAPI)`
3. Call it from `index.ts`

## Adding a new event handler

1. Create `events/your-handler.ts`
2. Export `registerYourHandler(pi: ExtensionAPI)`
3. Call it from `index.ts`
