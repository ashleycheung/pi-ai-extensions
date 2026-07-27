# coding-utils

A pi coding-agent extension that provides mode management (Execute/Plan/Ask), plan CRUD tools, plan interactive commands, and codebase search tools.

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
│   ├── list-plans.ts      # TUI-heavy plan viewer with comment editor
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
│   └── mode-messages.ts   # AIMode enum, PLAN_MODE_MESSAGE, ASK_MODE_MESSAGE
└── utils/                 # Pure utility functions (no side effects)
    ├── plans.ts           # Plan CRUD (file I/O for .pi/plans/ directory)
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

## Adding a new tool

1. Create `tools/your-tool.ts`
2. Export `registerYourTool(pi: ExtensionAPI)`
3. Call it from `index.ts`

## Adding a new event handler

1. Create `events/your-handler.ts`
2. Export `registerYourHandler(pi: ExtensionAPI)`
3. Call it from `index.ts`
