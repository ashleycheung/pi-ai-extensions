import { type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { modeState } from "../store/mode-state";
import { AIMode } from "../store/mode-messages";
import { hexAnsi } from "../utils/format";

const modeWidget = "ai-mode-widget";

export function registerCodeReviewCommand(pi: ExtensionAPI) {
  pi.registerCommand("codereview", {
    description:
      "Changes to code review mode (read-only, focused on reviewing code for bugs/issues)",
    handler: async (args, ctx) => {
      ctx.ui.setWidget(
        modeWidget,
        [hexAnsi("#10B981")("Code Review Mode")],
        {
          placement: "aboveEditor",
        }
      );
      modeState.mode = AIMode.CodeReview;
      modeState.hasSentInitialModeMessage = false;
      ctx.ui.notify(`Changed to Code Review Mode`, "info");
    },
  });
}
