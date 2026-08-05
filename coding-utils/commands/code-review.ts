import { type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { AIMode } from "../store/mode-messages";
import { setMode } from "../utils/set-mode";

export function registerCodeReviewCommand(pi: ExtensionAPI) {
  pi.registerCommand("codereview", {
    description:
      "Changes to code review mode (read-only, focused on reviewing code for bugs/issues)",
    handler: async (args, ctx) => {
      setMode(ctx.ui, AIMode.CodeReview);
    },
  });
}
