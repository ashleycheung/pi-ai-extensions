import { type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { modeState } from "../store/mode-state";
import { AIMode } from "../store/mode-messages";
import { hexAnsi } from "../utils/format";

const modeWidget = "ai-mode-widget";

export function registerExploreCommand(pi: ExtensionAPI) {
  pi.registerCommand("explore", {
    description: "Changes to explore mode (read-only, no plan tools)",
    handler: async (args, ctx) => {
      ctx.ui.setWidget(modeWidget, [hexAnsi("#3B82F6")("Explore Mode")], {
        placement: "aboveEditor",
      });
      modeState.mode = AIMode.Explore;
      modeState.hasSentInitialModeMessage = false;
      ctx.ui.notify(`Changed to Explore Mode`, "info");
    },
  });
}
