import { type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { modeState } from "../store/mode-state";
import { AIMode, PLAN_MODE_MESSAGE, EXPLORE_MODE_MESSAGE } from "../store/mode-messages";

export function registerBeforeAgentStartHandler(pi: ExtensionAPI) {
  pi.on("before_agent_start" as any, async () => {
    switch (modeState.mode) {
      case AIMode.Execute: {
        if (!modeState.hasSentInitialModeMessage) {
          modeState.hasSentInitialModeMessage = true;
          return {
            message: {
              customType: "Execute Mode",
              content: `
                You are in Execute Mode and you have access to all your read, write, bash commands.
                You MUST breakdown your task into smaller actionable tasks.
                You MUST use TaskCreate and TaskUpdate to keep track of your progress.
                When exploring the codebase, you MUST use an Explore Agent via the Agent tool
              `,
              display: modeState.showModeMessage,
            },
          };
        }
        break;
      }
      case AIMode.Explore: {
        if (!modeState.hasSentInitialModeMessage) {
          modeState.hasSentInitialModeMessage = true;
          return {
            message: {
              customType: "Explore Mode",
              content: EXPLORE_MODE_MESSAGE,
              display: modeState.showModeMessage,
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
            display: modeState.showModeMessage,
          },
        };
      }
      case AIMode.Plan: {
        if (!modeState.hasSentInitialModeMessage) {
          modeState.hasSentInitialModeMessage = true;
          return {
            message: {
              customType: "Plan Mode",
              content: PLAN_MODE_MESSAGE,
              display: modeState.showModeMessage,
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
            display: modeState.showModeMessage,
          },
        };
      }
    }
  });
}
