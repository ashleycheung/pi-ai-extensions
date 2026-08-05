import { type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  planOutputState,
  savePlanOutputState,
} from "../store/plan-output-state";

export function registerTogglePlanOutputCommand(pi: ExtensionAPI) {
  pi.registerCommand("toggle_plan_output", {
    description:
      "Toggle plan output between the interactive viewer window and a notification",
    handler: async (_args, ctx) => {
      planOutputState.mode =
        planOutputState.mode === "viewer" ? "notify" : "viewer";
      await savePlanOutputState();

      ctx.ui.notify(
        planOutputState.mode === "viewer"
          ? "Plan output: viewer window (readplan / list_plans)"
          : "Plan output: notifications (readplan / list_plans)",
        "info"
      );
    },
  });
}
