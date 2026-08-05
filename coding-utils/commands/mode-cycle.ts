/**
 * Shift+Tab AI-mode cycle (Claude Code style).
 *
 * Cycles forward through AIMODE_CYCLE (Normal → Execute → Plan → Ask →
 * CodeReview), wrapping around. Requires `app.thinking.cycle` to be unbound
 * in ~/.pi/agent/keybindings.json, since Shift+Tab is pi's reserved built-in
 * binding (extension shortcuts matching reserved keys are skipped).
 */
import { type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Key } from "@mariozechner/pi-tui";
import { AIMODE_CYCLE } from "../store/mode-messages";
import { modeState } from "../store/mode-state";
import { setMode } from "../utils/set-mode";

export function registerModeCycle(pi: ExtensionAPI) {
  pi.registerShortcut(Key.shift("tab"), {
    description: "Cycle AI mode: Normal → Plan → Execute → Ask → CodeReview",
    handler: (ctx) => {
      const next =
        AIMODE_CYCLE[
          (AIMODE_CYCLE.indexOf(modeState.mode) + 1) % AIMODE_CYCLE.length
        ];
      setMode(ctx.ui, next);
    },
  });
}
