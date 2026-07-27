import { type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { modeState } from "../store/mode-state";
import { AIMode } from "../store/mode-messages";
import { hexAnsi } from "../utils/format";

const modeWidget = "ai-mode-widget";

export function registerAskCommand(pi: ExtensionAPI) {
  pi.registerCommand("ask", {
    description: "Changes to ask mode (read-only, no plan tools)",
    handler: async (args, ctx) => {
      ctx.ui.setWidget(modeWidget, [hexAnsi("#3B82F6")("Ask Mode")], {
        placement: "aboveEditor",
      });
      modeState.mode = AIMode.Ask;
      modeState.hasSentInitialModeMessage = false;
      ctx.ui.notify(`Changed to Ask Mode`, "info");
    },
  });
}
