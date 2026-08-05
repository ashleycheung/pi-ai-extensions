import { type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { AIMode } from "../store/mode-messages";
import { setMode } from "../utils/set-mode";

export function registerPlanCommand(pi: ExtensionAPI) {
  pi.registerCommand("plan", {
    description: "Changes to plan mode",
    handler: async (args, ctx) => {
      setMode(ctx.ui, AIMode.Plan);
    },
  });
}
