/**
 * Shared AI-mode switch logic.
 *
 * Single implementation of what /plan, /ask, /codereview, /execute, /normal
 * and the Shift+Tab mode cycle all do: update the mode widget, set
 * `modeState.mode`, reset the initial-mode-message flag (so the mode prompt is
 * re-injected on the next agent start), and notify.
 */
import { type ExtensionUIContext } from "@mariozechner/pi-coding-agent";
import { hexAnsi } from "./format";
import { AIMode, MODE_META } from "../store/mode-messages";
import { modeState } from "../store/mode-state";

const MODE_WIDGET = "ai-mode-widget";

export function setMode(ui: ExtensionUIContext, mode: AIMode): void {
  const meta = MODE_META[mode];
  ui.setWidget(MODE_WIDGET, [hexAnsi(meta.color)(meta.label)], {
    placement: "aboveEditor",
  });
  modeState.mode = mode;
  modeState.hasSentInitialModeMessage = false;
  ui.notify(`Changed to ${meta.label}`, "info");
}
