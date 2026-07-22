import { type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import {
  createPlan,
  deletePlan,
  getPlan,
  listPlans,
  editPlan,
  getPlanTitle,
  formatRelativeTime,
} from "./plans";

export function registerPlanTools(pi: ExtensionAPI) {
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
        const applied = await editPlan(
          ctx.cwd,
          params.planId,
          params.oldText,
          params.newText
        );

        if (!applied) {
          return {
            content: [
              {
                type: "text",
                text: `Edit failed: oldText not found in plan "${params.planId}"`,
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
