import { type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { modeState } from "../store/mode-state";

export function registerShowModeMessageCommand(pi: ExtensionAPI) {
  pi.registerCommand("showmodemessage", {
    description: "Shows the message injected at the start of each mode",
    handler: async (args, ctx) => {
      modeState.showModeMessage = true;
      ctx.ui.notify(`Show Mode Message set to true`, "info");
    },
  });
}
