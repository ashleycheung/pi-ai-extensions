# coding-utils — Behavior Reference

The `coding-utils/` extension provides: mode management, plan CRUD + viewer
commands, a `/diff` viewer, codebase search tools, and the plan-mode
command-safety harness.

Source layout: `commands/` (slash commands), `tools/` (LLM-callable tools),
`events/` (event handlers), `store/` (shared mutable state), `utils/` (pure
helpers). Everything is registered from `index.ts`.

## Modes

Commands switch between read-only and full-access modes. State lives in
`store/mode-state.ts` (`modeState.mode`, `hasSentInitialModeMessage`,
`showModeMessage`) and the mode list in `store/mode-messages.ts` (`AIMode`).

| Command | Effect |
| --- | --- |
| `/normal` | Normal Mode (gray widget) — default, full access, no mode prompt |
| `/plan` | Plan Mode (orange widget) — draft plans, read-only |
| `/execute` | Execute Mode (pink widget) — full access |
| `/ask` | Ask Mode (blue widget) — read-only, no plan tools |
| `/codereview` | Code Review Mode (green widget) — read-only, review-focused |
| `/showmodemessage` | Set `showModeMessage = true` |
| `/hidemodemessage` | Set `showModeMessage = false` |

**Shift+Tab cycles modes** (Claude Code style): forward, starting at Normal →
Plan → Execute → Ask → Code Review, wrapping around
(`commands/mode-cycle.ts`, registered via `pi.registerShortcut`). Because
Shift+Tab is pi's reserved built-in binding for `app.thinking.cycle`,
`~/.pi/agent/keybindings.json` must unbind it — the extension creates the
file with `{"app.thinking.cycle": []}`; after editing keybindings you must
`/reload` pi for shortcuts to take effect.

All mode commands (and the cycle) share one implementation,
`utils/set-mode.ts` `setMode()`: each sets the `ai-mode-widget` widget above
the editor and marks `hasSentInitialModeMessage = false` so the next agent
start re-injects the mode instructions.

On `before_agent_start` (`events/before-agent-start.ts`), the mode's prompt
(`store/mode-messages.ts`: `PLAN_MODE_MESSAGE`, `ASK_MODE_MESSAGE`,
`CODE_REVIEW_MESSAGE`, plus coding guidelines) is injected as a custom
message when `hasSentInitialModeMessage` is false; afterwards, Plan Mode
injects a short "nudge" reminder instead. `showModeMessage` controls the
`display` flag of these messages.

## Command safety (the plan-mode "harness")

`events/command-safety.ts` intercepts `tool_call` events:

- **`bash`** — blocked in Plan/Ask/Code Review modes unless
  `utils/command-patterns.ts` `isSafeCommand()` approves it. Model
  (post-fix, fixed allowlist):
  1. **Normalize** — harmless redirects are stripped
     (`2>/dev/null`, `>/dev/null`, `1>/dev/null`, `&>/dev/null`,
     `>>/dev/null`, `2>&1`, `1>&2`, `2>&-`), and `git -C <path>` /
     `git -c <k>=<v>` prefixes are flattened to `git`.
  2. **Split** into segments on `&&`, `||`, `;`, `|`, newlines
     (quote-aware — `echo "a && b"` stays one segment).
  3. **Every segment** must be non-destructive AND match the allowlist.
     Unknown commands are blocked; the whole command is blocked if any
     segment fails.
  - Destructive patterns include: rm/rmdir/mv/cp/mkdir/touch/chmod/chown/
    ln/tee/truncate/dd/shred, `> file` / `>> file` / `1> file` / `2> file`
    redirects (but not `->`, `2>`, or `/dev/null` targets), package-manager
    installs (npm/yarn/pnpm/pip/apt/brew), git write ops (add/commit/push/
    pull/merge/rebase/reset/checkout/branch -d/-D/stash/cherry-pick/revert/
    tag/init/clone), sudo/su, kill/pkill/killall, reboot/shutdown,
    systemctl/service start|stop|restart, editors (vim/nano/emacs/code/subl).
  - Allowlist includes: cd; cat/head/tail/less/more/grep/find/ls/pwd/echo/
    printf/wc/sort/uniq/diff/file/stat/du/df/tree/which/whereis/type/env/
    printenv/uname/whoami/id/date/cal/uptime/ps/top/htop/free; read-only
    coreutils (cut/tr/column/fmt/fold/tac/nl/od/xxd/hexdump/strings/
    readlink/realpath/basename/dirname/test/[ /true/false/base64/sha256sum/
    shasum/md5/md5sum/openssl dgst); read-only git (status/log/diff/show/
    blame/grep/cat-file/rev-parse/remote -v|show/config --get/help/ls-*/
    branch listing); read-only npm/yarn; `node --version`, `python3
    --version`, `tsc --noEmit` via npx/bunx/npm exec/yarn; curl, `wget -O -`;
    jq/sed -n/awk/rg/fd/bat/eza.
  - When blocked, a steer message is sent naming the offending segment and
    the reason (destructive pattern or not-allowlisted).
  - `grep`/`find` commands are also **transformed** (see Search tools).
- **`edit`** — blocked in Plan/Ask/Code Review modes.
- **`plan_create` / `plan_edit` / `plan_delete`** — blocked in Ask/Code
  Review modes (allowed in Plan).

## Plan system

Plans are markdown files at `<workspace>/.pi/plans/plan.<id>.md`; the title
is the first `#`/`##` heading. `utils/plans.ts` handles all file I/O
(`listPlans` sorts by mtime desc, `getPlan`, `createPlan`, `deletePlan`,
`editPlan`, `formatRelativeTime`).

### Tools (LLM-facing)

- `plan_list` — all plans (id/title/mtime).
- `plan_get` — full markdown of a plan by id.
- `plan_create` — creates a plan with a title, returns the new id.
- `plan_edit` — replace `oldText` with `newText` in a plan. Matching is
  **exact first** (native edit tool), then an escape-unescaped fallback
  (backslash-backtick → backtick, double-backslash → backslash, literal
  `\n`/`\t` → newline/tab on both sides). Failures return the tail of the
  plan file with a hint that matching is literal.
- `plan_delete` — deletes a plan.

Known quirk: the harness has intermittently rejected `plan_edit` calls with
"planId: must have required properties planId" before execution (an
arg-binding race outside this extension). Workaround: retry; keep payloads
small.

### Commands (user-facing)

- `readplan` — shows the most recently edited plan.
- `list_plans` — interactive selector (`Exit` cancels), then shows the
  chosen plan.
- `delete_plan` — selector + confirmation, then deletes.
- `/toggle_plan_output` — switches plan output between the **viewer window**
  (default) and **notifications**; persisted to `<agentDir>/
  plan-output-mode.json` (`getAgentDir()` from pi-coding-agent), loaded at
  extension startup. One toggle applies to both `readplan` and `list_plans`.

### Plan output modes

- **viewer** (default): the plan opens in a custom TUI window —
  scrollable rendered markdown (↑/↓ line-by-line, **Ctrl+D / Ctrl+U** half-page,
  vim-style), **i** enters the comment input (vim-style;
  Esc returns to scroll mode),
  **Enter** sends the comment as a user message prefixed
  `[Plan: <id>]\n\n<comment>`, **Esc** closes (Esc again exits input mode
  first). The comment input renders as a **Codex-style bordered box**
  (rounded `╭─╮`/`╰─╯` top/bottom, padded — shared with `claude-code-style.ts`
  via `utils/box.ts`). The comment text is kept as a **session-only draft** per plan
  (`plan:<cwd>:<planId>`, stored in `store/comment-drafts.ts`): closing without
  submitting saves it, reopening the same plan restores it, and submitting
  clears it. Implemented by the shared `utils/comment-viewer.ts`.
- **notify**: current notification behavior — `readplan` notifies;
  `list_plans` sets the editor text to `[ Plan <id> ]\n\n` and notifies.
- Non-TUI contexts (print/RPC) always fall back to notify.

## `/diff`

Runs `git diff` (extra args appended), shows the result in the same shared
viewer (colorized by diff prefix: + green, − red, @@ accent, headers muted),
with a comment input whose text is sent as a user message (rendered as the
same Codex-style bordered box as the plan viewer; draft kept
session-only per workspace, keyed `diff:<cwd>` — same save/restore/clear
behavior as the plan viewer). Empty diff →
notify; non-TUI → notify.

## Search tools

- `search_files` — `fd <pattern>` (filename search), truncated output with
  temp-file fallback (`utils/truncation.ts`).
- `search_codebase` — `rg`-based content search, same truncation.
- `events/command-safety.ts` **transforms** bash `grep`/`find` calls to
  exclude `node_modules`, `dist`, and `build` (`utils/transform.ts`).

## Store & utils conventions

- `store/mode-state.ts`, `store/plan-output-state.ts` — shared mutable
  objects; mutate properties, never reassign the exported binding.
- `utils/` — pure functions (plans.ts does file I/O but takes explicit
  `cwd`/paths); comment-viewer.ts is a pure TUI component factory.
