import { type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { listPlans, formatRelativeTime } from "../utils/plans";

export function registerPlanListTool(pi: ExtensionAPI) {
  pi.registerTool({
    name: "plan_list",
    label: "List Plans",
    description: "Lists all the plans with available with its id + title",
    promptSnippet: "Lists all saved plans with their IDs and titles",
    promptGuidelines: [
      "Use plan_list to see all available plans and their titles before referencing them.",
    ],
    parameters: Type.Object({}),
    async execute(toolCallId, params, signal, onUpdate, ctx): Promise<any> {
      if (signal?.aborted) {
        return { content: [{ type: "text", text: "Cancelled" }] };
      }

      onUpdate?.({
        content: [{ type: "text", text: "Listing plans..." }],
        details: { progress: 50 },
      });

      const plans = await listPlans(ctx.cwd);

      if (plans.length === 0) {
        return {
          content: [{ type: "text", text: "No plans found" }],
        };
      }

      const resultText = plans
        .map((p) => `- ${p.title} — ${formatRelativeTime(p.updatedAt)}`)
        .join("\n");

      return {
        content: [
          {
            type: "text",
            text: `Available plans (${plans.length}):\n\n${resultText}`,
          },
        ],
        details: { count: plans.length },
      };
    },
  });
}
