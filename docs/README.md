# Pi Extensions — Behavior Documentation

This folder documents the **expected behavior** of the extensions in this repo
(`/Users/ashleycheung/.pi/agent/extensions/`), so that future agents and users
know what is happening without reverse-engineering the code.

## What lives here

| Path | What it does |
| --- | --- |
| `coding-utils/` | Mode management (Execute/Plan/Ask/Code Review), plan CRUD tools, plan viewer commands, `/diff`, codebase search tools, and the plan-mode command-safety harness. See [coding-utils.md](coding-utils.md). |
| `claude-code-style.ts` | A "pi look" extension: custom startup header + Codex-style input box. See [pi-look.md](pi-look.md). |

## How extensions load

- Global extensions in `~/.pi/agent/extensions/` (this folder) are auto-discovered:
  `*.ts` files and `*/index.ts` subdirectories.
- Changes take effect with `/reload` (or a pi restart).
- The package is pnpm-based (`pnpm-lock.yaml`); runtime deps are in
  `package.json` (`@mariozechner/pi-coding-agent`, `typebox`).
- Code is transpiled on load (Babel) — there is no build/typecheck step, so
  run `npx tsc --noEmit` (see `coding-utils/README.md`) or test manually.

## Conventions (keep these when extending)

- **One file per registration** — every `pi.registerCommand()`,
  `pi.registerTool()`, or `pi.on()` call lives in its own file under
  `commands/`, `tools/`, or `events/`, exporting a single `register*` function.
- **Shared state goes in `store/`** — mutable const-object pattern
  (`export const modeState = { ... }`), never `export let` (CommonJS
  visibility).
- **Pure helpers go in `utils/`** — no `pi`/`ctx` dependencies where possible.
- **Update the docs** — when behavior changes, update this folder and the
  relevant README.
- Plan files live in `<workspace>/.pi/plans/plan.<id>.md` (see
  `coding-utils.md` → Plan system).

## Quick reference

- Modes: `/plan`, `/execute`, `/ask`, `/codereview`, `/showmodemessage`, `/hidemodemessage`
- Plans: `readplan`, `list_plans`, `delete_plan`, `/toggle_plan_output` + `plan_get`, `plan_list`, `plan_create`, `plan_edit`, `plan_delete` tools
- Code: `/diff`
- Search: `search_files`, `search_codebase` tools
- Look: `/pi-startup-look`, `/pi-look`
