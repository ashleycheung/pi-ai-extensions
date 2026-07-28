import { type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { listPlans, getPlan, formatRelativeTime } from "../utils/plans";

export function registerListPlansCommand(pi: ExtensionAPI) {
  pi.registerCommand("list_plans", {
    description: "Lists all plans in an interactive selector",
    handler: async (args, ctx) => {
      const plans = await listPlans(ctx.cwd);

      if (plans.length === 0) {
        ctx.ui.notify("No plans found", "info");
        return;
      }

      const optionToId = new Map<string, string>();
      const options = [
        ...plans.map((p) => {
          const label = `${p.title} - ${formatRelativeTime(p.updatedAt)}`;
          optionToId.set(label, p.id);
          return label;
        }),
        "Exit",
      ];

      const selected = await ctx.ui.select("📋 Plans", options);

      if (!selected || selected === "Exit") {
        ctx.ui.notify("Plan selection cancelled", "info");
        return;
      }

      // Look up plan ID from the selected option label
      const planId = optionToId.get(selected);
      const plan = plans.find((p) => p.id === planId);
      const planTitle = plan?.title ?? planId;

      const planContent = await getPlan(ctx.cwd, String(planId));
      if (planContent === undefined) {
        ctx.ui.notify(`Plan "${planId}" not found`, "error");
        return;
      }

      ctx.ui.notify(`📄 ${planTitle} (${planId})\n\n${planContent}`, "info");
    },
  });
}
