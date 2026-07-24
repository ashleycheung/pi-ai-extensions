import { type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { createPlan } from "../utils/plans";

export function registerPlanCreateTool(pi: ExtensionAPI) {
  pi.registerTool({
    name: "plan_create",
    label: "Plan Create",
    description:
      "Creates a new plan with a randomly generated ID and the given title",
    promptSnippet:
      "Creates a new plan file with a generated ID and the provided title",
    promptGuidelines: [
      "Use plan_create to create a new plan. The tool returns the plan ID which you should reference in subsequent calls.",
    ],
    parameters: Type.Object({
      title: Type.String({
        description: "The title of the plan (becomes the first heading)",
      }),
    }),
    async execute(
      toolCallId,
      params: { title: string },
      signal,
      onUpdate,
      ctx
    ): Promise<any> {
      if (signal?.aborted) {
        return { content: [{ type: "text", text: "Cancelled" }] };
      }

      onUpdate?.({
        content: [{ type: "text", text: "Creating plan..." }],
        details: { progress: 50 },
      });

      const planId = await createPlan(ctx.cwd, params.title);

      return {
        content: [
          {
            type: "text",
            text: `Created plan "${params.title}" with ID: ${planId}`,
          },
        ],
        details: { planId, title: params.title },
      };
    },
  });
}
