import { type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { listPlans, formatRelativeTime } from "../utils/plans";
import { AIMode } from "../store/mode-messages";
import { setMode } from "../utils/set-mode";

export function registerCodereviewPlanCommand(pi: ExtensionAPI) {
  pi.registerCommand("codereview_plan", {
    description:
      "Select a plan and review it in Code Review Mode (injects the plan id + review prompt into the input)",
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

      const planId = optionToId.get(selected);
      if (!planId) {
        ctx.ui.notify("Plan selection cancelled", "info");
        return;
      }

      // Switch to Code Review Mode (widget + state + prompt injection on next agent start)
      setMode(ctx.ui, AIMode.CodeReview);

      // Inject the plan id and the review prompt into the input editor
      ctx.ui.setEditorText(`[ Plan ${planId} ]\nReview this plan`);
    },
  });
}
