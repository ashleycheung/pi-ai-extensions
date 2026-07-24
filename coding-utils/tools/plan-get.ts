import { type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { getPlan } from "../utils/plans";

export function registerPlanGetTool(pi: ExtensionAPI) {
  pi.registerTool({
    name: "plan_get",
    label: "Plan Get",
    description:
      "Gets the markdown contents of a specific plan given the plan id",
    promptSnippet:
      "Retrieves the full markdown content of a saved plan by its plan ID",
    promptGuidelines: [
      "Use plan_get when the user asks to view or retrieve a previously saved plan.",
    ],
    parameters: Type.Object({
      planId: Type.String({ description: "The ID of the plan to retrieve" }),
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
        content: [{ type: "text", text: `Getting plan "${params.planId}"...` }],
        details: { progress: 50 },
      });

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

      return {
        content: [{ type: "text", text: content }],
        details: { planId: params.planId },
      };
    },
  });
}
