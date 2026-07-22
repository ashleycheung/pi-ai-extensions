/**
 * This extension add some code utils to make programming easier
 */
import {
  getMarkdownTheme,
  type ExtensionAPI,
  type ToolCallEvent,
  type ToolCallEventResult,
} from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { isSafeCommand } from "./utils";
import { handleTruncation } from "./truncation";
import {
  Editor,
  Key,
  Markdown,
  matchesKey,
  truncateToWidth,
} from "@mariozechner/pi-tui";
import { hexAnsi } from "./format";
import { transformGrepCommands, transformFindCommands } from "./transform";
import {
  createPlan,
  deletePlan,
  getPlan,
  listPlans,
  editPlan,
  getPlanTitle,
  formatRelativeTime,
} from "./plans";

enum AIMode {
  None = "none",
  Execute = "execute",
  Plan = "plan",
  Explore = "explore",
}

const PLAN_MODE_MESSAGE = `You are in Plan Mode and you are to draft a plan.
You MUST NOT make any file changes.
To CREATE a new plan you MUST use the "plan_create" tool.
To EDIT an existing plan you MUST use the "plan_edit" tool.
To DELETE a plan you MUST use the "plan_delete" tool (which asks for your confirmation first).
To LIST current plans, you MUST use the "plan_list" tool.
To READ a plan, you MUST use the "plan_get" tool.
All your actions, commands, and scripts MUST be readonly.
When drafting this plan:
  - You MUST NOT make any edits unless its via the "plan_edit" tool
  - When exploring the codebase, you MUST use an Explore Agent via the Agent tool.
  - If there are any ambiguities in the plan, you MUST clarify with the user.
  - When your plan is complete, you MUST ask the user if they would like to execute on the plan.`;

const EXPLORE_MODE_MESSAGE = `You are in Explore Mode.
Your aim is to EXPLORE and INVESTIGATE the users questions.
You MUST NOT make any file changes.
You MUST NOT EDIT or CREATE any plans.
When exploring the codebase, you MUST use an Explore Agent via the Agent tool.`;

let mode = AIMode.None;
let hasSentInitialModeMessage = false;
let showModeMessage = false;
const modeWidget = "ai-mode-widget";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("showmodemessage", {
    description: "Shows the message injected at the start of each mode",
    handler: async (args, ctx) => {
      showModeMessage = true;
      ctx.ui.notify(`Show Mode Message set to true`, "info");
    },
  });
  pi.registerCommand("hidemodemessage", {
    description: "Hides the message injected at the start of each mode",
    handler: async (args, ctx) => {
      showModeMessage = false;
      ctx.ui.notify(`Show Mode Message set to false`, "info");
    },
  });
  pi.registerCommand("execute", {
    description: "Changes to execute mode",
    handler: async (args, ctx) => {
      ctx.ui.setWidget(modeWidget, [hexAnsi("#ED64A6")("Execute Mode")], {
        placement: "aboveEditor",
      });
      mode = AIMode.Execute;
      hasSentInitialModeMessage = false;
      ctx.ui.notify(`Changed to Execute Mode`, "info");
    },
  });
  pi.registerCommand("plan", {
    description: "Changes to plan mode",
    handler: async (args, ctx) => {
      ctx.ui.setWidget(modeWidget, [hexAnsi("#ED8936")("Plan Mode")], {
        placement: "aboveEditor",
      });
      mode = AIMode.Plan;
      hasSentInitialModeMessage = false;
      ctx.ui.notify(`Changed to Plan Mode`, "info");
    },
  });
  pi.registerCommand("explore", {
    description: "Changes to explore mode (read-only, no plan tools)",
    handler: async (args, ctx) => {
      ctx.ui.setWidget(modeWidget, [hexAnsi("#3B82F6")("Explore Mode")], {
        placement: "aboveEditor",
      });
      mode = AIMode.Explore;
      hasSentInitialModeMessage = false;
      ctx.ui.notify(`Changed to Explore Mode`, "info");
    },
  });
  pi.on("before_agent_start" as any, async () => {
    switch (mode) {
      case AIMode.Execute: {
        if (!hasSentInitialModeMessage) {
          hasSentInitialModeMessage = true;
          return {
            message: {
              customType: "Execute Mode",
              content: `
                You are in Execute Mode and you have access to all your read, write, bash commands.
                You MUST breakdown your task into smaller actionable tasks.
                You MUST use TaskCreate and TaskUpdate to keep track of your progress.
                When exploring the codebase, you MUST use an Explore Agent via the Agent tool
              `,
              display: showModeMessage,
            },
          };
        }
        break;
      }
      case AIMode.Explore: {
        if (!hasSentInitialModeMessage) {
          hasSentInitialModeMessage = true;
          return {
            message: {
              customType: "Explore Mode",
              content: EXPLORE_MODE_MESSAGE,
              display: showModeMessage,
            },
          };
        }
        return {
          message: {
            customType: "Explore Mode Nudge",
            content: `
              You are in Explore Mode.
              You MUST NOT make any edits or file changes
            `,
            display: showModeMessage,
          },
        };
      }
      case AIMode.Plan: {
        if (!hasSentInitialModeMessage) {
          hasSentInitialModeMessage = true;
          return {
            message: {
              customType: "Plan Mode",
              content: PLAN_MODE_MESSAGE,
              display: showModeMessage,
            },
          };
        }
        // Nudges
        return {
          message: {
            customType: "Plan Mode Nudge",
            content: `
                You are in Plan Mode.
                You MUST NOT make any edits or file changes
              `,
            display: showModeMessage,
          },
        };
      }
    }
  });
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
          const label = `${p.title} — ${formatRelativeTime(p.updatedAt)}`;
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

      const planContent = await getPlan(ctx.cwd, planId);
      if (planContent === undefined) {
        ctx.ui.notify(`Plan "${planId}" not found`, "error");
        return;
      }

      if (ctx.mode !== "tui") {
        ctx.ui.notify(
          `Plan "${planTitle}" (${planId}):\n\n${planContent}`,
          "info"
        );
        return;
      }

      // Show plan content in a scrollable markdown viewer starting at the top
      const comment = await ctx.ui.custom<string | undefined>(
        (tui, theme, _kb, done) => {
          const markdownTheme = getMarkdownTheme(theme);
          const markdown = new Markdown(
            planContent,
            0, // paddingX
            0, // paddingY
            markdownTheme
          );
          let scrollOffset = 0;
          let isInputMode = false;
          const maxEditorLines = 5;
          let cachedLines: string[] | undefined;
          let renderedWidth = 0;

          // Multi-line editor for comments (handles Enter=submit, Shift+Enter=newline)
          const editor = new Editor(theme, _kb);
          editor.onSubmit = (text) => {
            if (text.trim()) {
              done(text);
            }
          };

          function refresh() {
            cachedLines = undefined;
            tui.requestRender();
          }

          function handleInput(data: string) {
            if (matchesKey(data, Key.escape)) {
              if (isInputMode) {
                isInputMode = false;
                refresh();
                return;
              }
              done(undefined);
              return;
            }

            if (matchesKey(data, Key.tab)) {
              isInputMode = !isInputMode;
              refresh();
              return;
            }

            if (isInputMode) {
              editor.handleInput(data);
              refresh();
              return;
            }

            // Scroll mode
            if (matchesKey(data, Key.up)) {
              scrollOffset = Math.max(0, scrollOffset - 1);
              refresh();
              return;
            }
            if (matchesKey(data, Key.down)) {
              const editorLineCount = Math.min(
                maxEditorLines,
                editor.getText()
                  ? Math.max(1, editor.getLines(renderedWidth - 2).length)
                  : 1
              );
              const inputAreaLines = 3 + editorLineCount;
              const viewportHeight = Math.max(
                1,
                tui.terminal.rows - 5 - inputAreaLines
              );
              const maxScroll = Math.max(
                0,
                markdown.render(renderedWidth).length - viewportHeight
              );
              scrollOffset = Math.min(maxScroll, scrollOffset + 1);
              refresh();
              return;
            }
          }

          function render(width: number): string[] {
            if (cachedLines) return cachedLines;

            const renderWidth = Math.max(1, width);
            renderedWidth = renderWidth;

            // Calculate editor lines to determine viewport
            const editorLineCount = Math.min(
              maxEditorLines,
              editor.getText()
                ? Math.max(1, editor.getLines(renderWidth - 2).length)
                : 1
            );
            const inputAreaLines = 3 + editorLineCount;
            const viewportHeight = Math.max(
              1,
              tui.terminal.rows - 5 - inputAreaLines
            );
            const trunc = (line: string) => truncateToWidth(line, renderWidth);

            // Re-render markdown at the current width
            markdown.invalidate();
            const fullLines = markdown.render(renderWidth);

            const lines: string[] = [];

            // Title
            const title = `📄 ${planTitle}  (${planId})`;
            lines.push(trunc(title));
            lines.push(trunc("─".repeat(renderWidth)));

            // Content (rendered by Markdown component)
            const visible = fullLines.slice(
              scrollOffset,
              scrollOffset + viewportHeight
            );
            for (const line of visible) {
              lines.push(trunc(line));
            }

            // Scroll indicator
            const totalLines = fullLines.length;
            const maxScroll = Math.max(0, totalLines - viewportHeight);
            if (maxScroll > 0) {
              lines.push(trunc("─".repeat(renderWidth)));
              lines.push(
                trunc(
                  `↑↓ scroll • line ${scrollOffset + 1}-${Math.min(
                    scrollOffset + viewportHeight,
                    totalLines
                  )} of ${totalLines} • Esc to close`
                )
              );
            }

            // Input area
            lines.push(trunc("─".repeat(renderWidth)));
            const modeIndicator = isInputMode ? "🔤" : "💬";
            const hint = isInputMode
              ? "Enter to send • Shift+Enter newline • Tab/Esc to scroll"
              : "Tab to type comment • ↑↓ scroll • Esc to close";
            lines.push(trunc(`${modeIndicator}  ${hint}`));

            // Render editor content (with line limit)
            if (isInputMode || editor.getText()) {
              const editorWidth = Math.max(1, renderWidth - 2);
              const allEditorLines = editor.getLines(editorWidth);
              const visibleEditorLines = allEditorLines.slice(
                0,
                maxEditorLines
              );
              for (const line of visibleEditorLines) {
                lines.push(trunc(` ${line}`));
              }
              if (allEditorLines.length > maxEditorLines) {
                lines.push(
                  trunc(
                    ` ⤶ ${allEditorLines.length - maxEditorLines} more line${
                      allEditorLines.length - maxEditorLines !== 1 ? "s" : ""
                    }`
                  )
                );
              }
            } else {
              lines.push(trunc(" (press Tab to start typing)"));
            }

            cachedLines = lines;
            return lines;
          }

          return {
            render,
            invalidate: () => {
              cachedLines = undefined;
            },
            handleInput,
          };
        }
      );

      if (comment) {
        const planPrefix = `[Plan: ${planId}]\n\n`;
        pi.sendUserMessage(`${planPrefix}${comment}`);
      }
    },
  });
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

  // Check tool calls
  pi.on(
    "tool_call" as any,
    async (event: ToolCallEvent, ctx): Promise<ToolCallEventResult | void> => {
      switch (event.toolName) {
        // Bash tool
        case "bash": {
          if (
            (mode === AIMode.Plan || mode === AIMode.Explore) &&
            !isSafeCommand(String(event.input.command))
          ) {
            const modeName = mode === AIMode.Plan ? "Plan" : "Explore";
            const modeMessage = mode === AIMode.Plan ? PLAN_MODE_MESSAGE : EXPLORE_MODE_MESSAGE;
            pi.sendUserMessage(modeMessage, { deliverAs: "steer" });
            return {
              block: true,
              reason: `
              You are in ${modeName} Mode.
              Destructive bash commands are strictly NOT allowed.
              You must explicitly ask the user to change to execute mode to enable destructive bash commands`,
            };
          }

          const command = (event.input.command as any)?.trim() as
            | string
            | undefined;
          if (!command) return;

          let finalCommand = command;
          finalCommand = transformGrepCommands(finalCommand);
          finalCommand = transformFindCommands(finalCommand);

          if (finalCommand !== command) {
            ctx.ui.notify(
              `Bash command transformed to: ${finalCommand}`,
              "info"
            );
          }

          const newInput: ToolCallEvent["input"] = {
            ...event.input,
            command: finalCommand,
          };
          return newInput as any;
        }
        case "edit": {
          if (mode === AIMode.Plan || mode === AIMode.Explore) {
            const modeName = mode === AIMode.Plan ? "Plan" : "Explore";
            const modeMessage = mode === AIMode.Plan ? PLAN_MODE_MESSAGE : EXPLORE_MODE_MESSAGE;
            pi.sendUserMessage(modeMessage, { deliverAs: "steer" });
            return {
              block: true,
              reason: `
              You are in ${modeName} Mode.
              Edits are strictly NOT allowed.
              You must explicitly ask the user to change to execute mode to enable file editing`,
            };
          }
        }
        case "plan_create":
        case "plan_edit":
        case "plan_delete": {
          if (mode === AIMode.Explore) {
            pi.sendUserMessage(EXPLORE_MODE_MESSAGE, { deliverAs: "steer" });
            return {
              block: true,
              reason: `
              You are in Explore Mode.
              You must not create, edit, or delete plans.
              You must explicitly ask the user to change to another mode to modify plans`,
            };
          }
        }
      }
    }
  );
}
