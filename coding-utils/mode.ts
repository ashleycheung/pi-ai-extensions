import { type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { hexAnsi } from "./format";

export enum AIMode {
  None = "none",
  Execute = "execute",
  Plan = "plan",
  Explore = "explore",
}

export const PLAN_MODE_MESSAGE = `You are in Plan Mode and you are to draft a plan.
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

export const EXPLORE_MODE_MESSAGE = `You are in Explore Mode.
Your aim is to EXPLORE and INVESTIGATE the users questions.
You MUST NOT make any file changes.
You MUST NOT EDIT or CREATE any plans.
When exploring the codebase, you MUST use an Explore Agent via the Agent tool.`;

// Use a shared mutable object instead of `export let` to ensure
// cross-module changes are visible under CommonJS transpilation.
// Babel's plugin-transform-modules-commonjs compiles `export let` to
// `let x = exports.x = value`, where reassignment only updates the
// local variable but not the exports object. By keeping the object
// reference constant (const) and only mutating its properties, other
// modules always see the current value.
export const modeState = {
  mode: AIMode.None as AIMode,
};
let hasSentInitialModeMessage = false;
let showModeMessage = false;
const modeWidget = "ai-mode-widget";

export function registerModeCommands(pi: ExtensionAPI) {
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
      modeState.mode = AIMode.Execute;
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
      modeState.mode = AIMode.Plan;
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
      modeState.mode = AIMode.Explore;
      hasSentInitialModeMessage = false;
      ctx.ui.notify(`Changed to Explore Mode`, "info");
    },
  });
}

export function registerBeforeAgentStartHandler(pi: ExtensionAPI) {
  pi.on("before_agent_start" as any, async () => {
    switch (modeState.mode) {
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
}
