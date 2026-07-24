import { type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { getPlan, getPlanTitle, deletePlan } from "../utils/plans";

export function registerPlanDeleteTool(pi: ExtensionAPI) {
  pi.registerTool({
    name: "plan_delete",
    label: "Plan Delete",
    description: "Deletes a saved plan by its ID after user confirmation",
    promptSnippet:
      "Deletes a plan file by its ID, after asking for user confirmation",
    promptGuidelines: [
      "To delete a plan, you MUST use the 'plan_delete' tool which asks for user confirmation first.",
    ],
    parameters: Type.Object({
      planId: Type.String({
        description: "The ID of the plan to delete",
      }),
    }),
    async execute(
      toolCallId,
      params: { planId: string },
      signal,
      onUpdate,
      ctx
    ): Promise<any> {
      if (signal?.aborted) {
        return { content: [{ type: "text", text: "Cancelled" }] };
      }

      onUpdate?.({
        content: [
          { type: "text", text: `Looking up plan "${params.planId}"...` },
        ],
        details: { progress: 30 },
      });

      // Look up the plan to show the user what they're deleting
      const content = await getPlan(ctx.cwd, params.planId);
      if (content === undefined) {
        return {
          content: [
            {
              type: "text",
              text: `Plan "${params.planId}" not found`,
            },
          ],
        };
      }

      const title = getPlanTitle(content) ?? params.planId;

      // Check if UI is available
      if (!ctx.hasUI) {
        return {
          content: [
            {
              type: "text",
              text: `Cannot delete plan "${title}" (${params.planId}) without UI confirmation. Please send a user message asking for confirmation before proceeding.`,
            },
          ],
        };
      }

      onUpdate?.({
        content: [
          {
            type: "text",
            text: `Asking for confirmation to delete plan "${title}"...`,
          },
        ],
        details: { progress: 60 },
      });

      // Ask the user for confirmation
      const confirmed = await ctx.ui.confirm(
        "🗑 Delete plan?",
        `Are you sure you want to delete "${title}" (${params.planId})?`
      );

      if (!confirmed) {
        return {
          content: [
            {
              type: "text",
              text: `Deletion of plan "${title}" (${params.planId}) was cancelled by user`,
            },
          ],
        };
      }

      onUpdate?.({
        content: [{ type: "text", text: `Deleting plan "${title}"...` }],
        details: { progress: 80 },
      });

      const deleted = await deletePlan(ctx.cwd, params.planId);
      if (deleted) {
        return {
          content: [
            {
              type: "text",
              text: `Deleted plan "${title}" (${params.planId})`,
            },
          ],
          details: { planId: params.planId },
        };
      } else {
        return {
          content: [
            {
              type: "text",
              text: `Failed to delete plan "${params.planId}" — plan not found`,
            },
          ],
        };
      }
    },
  });
}
