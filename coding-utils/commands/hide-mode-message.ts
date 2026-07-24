import { type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { modeState } from "../store/mode-state";

export function registerHideModeMessageCommand(pi: ExtensionAPI) {
  pi.registerCommand("hidemodemessage", {
    description: "Hides the message injected at the start of each mode",
    handler: async (args, ctx) => {
      modeState.showModeMessage = false;
      ctx.ui.notify(`Show Mode Message set to false`, "info");
    },
  });
}
