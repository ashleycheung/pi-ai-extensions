import { type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { AIMode } from "../store/mode-messages";
import { setMode } from "../utils/set-mode";

export function registerAskCommand(pi: ExtensionAPI) {
  pi.registerCommand("ask", {
    description: "Changes to ask mode (read-only, no plan tools)",
    handler: async (args, ctx) => {
      setMode(ctx.ui, AIMode.Ask);
    },
  });
}
