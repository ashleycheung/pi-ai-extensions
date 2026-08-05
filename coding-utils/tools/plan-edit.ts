import { type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { editPlan } from "../utils/plans";

export function registerPlanEditTool(pi: ExtensionAPI) {
  pi.registerTool({
    name: "plan_edit",
    label: "Plan Edit",
    description:
      "Edits a plan given the id. This is a wrapper around the normal edit tool except it accepts the plan id instead of a file path",
    promptSnippet:
      "Edits a plan file by replacing matching text with new content, using the plan ID instead of a file path",
    promptGuidelines: [
      "Use plan_edit to make changes to a saved plan by referencing its plan ID.",
      "Provide the exact oldText to be replaced and the newText to replace it with.",
    ],
    parameters: Type.Object({
      planId: Type.String({ description: "The ID of the plan to edit" }),
      oldText: Type.String({
        description: "The exact text to be replaced",
      }),
      newText: Type.String({
        description: "The new text to replace with",
      }),
    }),
    async execute(
      toolCallId,
      params: { planId: string; oldText: string; newText: string },
      signal,
      onUpdate,
      ctx
    ): Promise<any> {
      if (signal?.aborted) {
        return { content: [{ type: "text", text: "Cancelled" }] };
      }

      onUpdate?.({
        content: [{ type: "text", text: `Editing plan "${params.planId}"...` }],
        details: { progress: 50 },
      });

      try {
        const result = await editPlan(
          ctx.cwd,
          params.planId,
          params.oldText,
          params.newText
        );

        if (!result.applied) {
          return {
            content: [
              {
                type: "text",
                text: `Edit failed: ${result.reason ?? `oldText not found in plan "${params.planId}"`}`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: `Plan "${params.planId}" updated successfully`,
            },
          ],
          details: { planId: params.planId },
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Error editing plan: ${
                err instanceof Error ? err.message : String(err)
              }`,
            },
          ],
        };
      }
    },
  });
}
