import { type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { AIMode } from "../store/mode-messages";
import { setMode } from "../utils/set-mode";

export function registerNormalCommand(pi: ExtensionAPI) {
  pi.registerCommand("normal", {
    description: "Changes back to normal mode",
    handler: async (args, ctx) => {
      setMode(ctx.ui, AIMode.Normal);
    },
  });
}
