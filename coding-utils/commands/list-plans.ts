import {
  getMarkdownTheme,
  type ExtensionAPI,
} from "@mariozechner/pi-coding-agent";
import { Markdown } from "@mariozechner/pi-tui";
import { listPlans, getPlan, formatRelativeTime } from "../utils/plans";
import { createCommentViewer, isTuiMode } from "../utils/comment-viewer";
import { planOutputState } from "../store/plan-output-state";

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

      // Notification mode (or non-TUI context): current behavior.
      if (planOutputState.mode === "notify" || !isTuiMode(ctx)) {
        ctx.ui.setEditorText(`[ Plan ${planId} ]\n\n`);
        ctx.ui.notify(`📄 ${planTitle} (${planId})\n\n${planContent}`, "info");
        return;
      }

      // Viewer mode: interactive window with a comment input.
      const comment = await ctx.ui.custom<string | undefined>(
        (tui, theme, kb, done) => {
          const markdown = new Markdown(
            planContent,
            0, // paddingX
            0, // paddingY
            getMarkdownTheme()
          );
          return createCommentViewer(tui, theme, kb, done, {
            title: `📄 ${planTitle}  (${planId})`,
            draftKey: `plan:${ctx.cwd}:${planId}`,
            thinkingLevel: pi.getThinkingLevel(),
            renderBody: (width) => {
              markdown.invalidate();
              return markdown.render(width);
            },
          });
        }
      );

      // If the user typed a comment, send it as a user message.
      if (comment) {
        pi.sendUserMessage(`[Plan: ${planId}]\n\n${comment}`);
      }
    },
  });
}
