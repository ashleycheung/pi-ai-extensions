import {
  getMarkdownTheme,
  type ExtensionAPI,
} from "@mariozechner/pi-coding-agent";
import { Markdown } from "@mariozechner/pi-tui";
import { listPlans, getPlan } from "../utils/plans";
import { createCommentViewer, isTuiMode } from "../utils/comment-viewer";
import { planOutputState } from "../store/plan-output-state";

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

      const fallbackNotify = () =>
        ctx.ui.notify(`📄 ${latest.title} (${latest.id})\n\n${content}`, "info");

      // Notification mode (or non-TUI context): just notify, as before.
      if (planOutputState.mode === "notify" || !isTuiMode(ctx)) {
        fallbackNotify();
        return;
      }

      // Viewer mode: interactive window with a comment input.
      const comment = await ctx.ui.custom<string | undefined>(
        (tui, theme, kb, done) => {
          const markdown = new Markdown(
            content,
            0, // paddingX
            0, // paddingY
            getMarkdownTheme()
          );
          return createCommentViewer(tui, theme, kb, done, {
            title: `📄 ${latest.title}  (${latest.id})`,
            draftKey: `plan:${ctx.cwd}:${latest.id}`,
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
        pi.sendUserMessage(`[Plan: ${latest.id}]\n\n${comment}`);
      }
    },
  });
}
