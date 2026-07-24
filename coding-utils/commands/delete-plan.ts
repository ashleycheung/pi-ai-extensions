import { type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { listPlans, deletePlan } from "../utils/plans";
import { formatRelativeTime } from "../utils/plans";

export function registerDeletePlanCommand(pi: ExtensionAPI) {
  pi.registerCommand("delete_plan", {
    description: "Deletes a plan after confirmation",
    handler: async (args, ctx) => {
      const plans = await listPlans(ctx.cwd);

      if (plans.length === 0) {
        ctx.ui.notify("No plans to delete", "info");
        return;
      }

      const optionToId = new Map<string, string>();
      const options = plans.map((p) => {
        const label = `${p.title} — ${formatRelativeTime(p.updatedAt)}`;
        optionToId.set(label, p.id);
        return label;
      });

      const selected = await ctx.ui.select("🗑 Delete plan", options);

      if (!selected) {
        ctx.ui.notify("Plan deletion cancelled", "info");
        return;
      }

      const planId = optionToId.get(selected);
      const plan = plans.find((p) => p.id === planId);
      const planTitle = plan?.title ?? planId;

      const confirmed = await ctx.ui.confirm(
        "Delete plan?",
        `Are you sure you want to delete "${planTitle}" (${planId})?`
      );

      if (!confirmed) {
        ctx.ui.notify("Plan deletion cancelled", "info");
        return;
      }

      const deleted = await deletePlan(ctx.cwd, planId);
      if (deleted) {
        ctx.ui.notify(`Deleted plan "${planTitle}" (${planId})`, "info");
      } else {
        ctx.ui.notify(`Plan "${planId}" not found`, "error");
      }
    },
  });
}
