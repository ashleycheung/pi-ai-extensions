import { type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { listPlans, getPlan } from "../utils/plans";

export function registerReadPlanCommand(pi: ExtensionAPI) {
  pi.registerCommand("readplan", {
    description: "Prints the most recently edited plan into chat",
    handler: async (args: string, ctx) => {
      const plans = await listPlans(ctx.cwd);

      if (plans.length === 0) {
        ctx.ui.notify("No plans found", "info");
        return;
      }

      const latest = plans[0];
      const content = await getPlan(ctx.cwd, latest.id);

      if (content === undefined) {
        ctx.ui.notify(`Plan "${latest.id}" not found`, "error");
        return;
      }

      ctx.ui.notify(`📄 ${latest.title} (${latest.id})\n\n${content}`, "info");
    },
  });
}
