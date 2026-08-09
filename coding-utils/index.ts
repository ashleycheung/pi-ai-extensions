import { type ExtensionAPI } from "@mariozechner/pi-coding-agent";

// Commands
import { registerShowModeMessageCommand } from "./commands/show-mode-message";
import { registerHideModeMessageCommand } from "./commands/hide-mode-message";
import { registerExecuteCommand } from "./commands/execute";
import { registerPlanCommand } from "./commands/plan";
import { registerAskCommand } from "./commands/ask";
import { registerCodeReviewCommand } from "./commands/code-review";
import { registerNormalCommand } from "./commands/normal";
import { registerModeCycle } from "./commands/mode-cycle";
import { registerListPlansCommand } from "./commands/list-plans";
import { registerDeletePlanCommand } from "./commands/delete-plan";
import { registerDiffCommand } from "./commands/diff";
import { registerReadPlanCommand } from "./commands/read-plan";
import { registerTogglePlanOutputCommand } from "./commands/toggle-plan-output";
import { registerCodereviewPlanCommand } from "./commands/codereview-plan";

// Tools
import { registerSearchFilesTool } from "./tools/search-files";
import { registerSearchCodebaseTool } from "./tools/search-codebase";
import { registerPlanGetTool } from "./tools/plan-get";
import { registerPlanListTool } from "./tools/plan-list";
import { registerPlanCreateTool } from "./tools/plan-create";
import { registerPlanEditTool } from "./tools/plan-edit";
import { registerPlanDeleteTool } from "./tools/plan-delete";
import { registerRequestBlockExemptionTool } from "./tools/request-block-exemption";

// Event handlers
import { registerBeforeAgentStartHandler } from "./events/before-agent-start";
import { registerCommandSafetyHandler } from "./events/command-safety";

// State
import { loadPlanOutputState } from "./store/plan-output-state";

const ENABLE_MODES = true;

export default async function (pi: ExtensionAPI) {
  await loadPlanOutputState();

  // Commands
  if (ENABLE_MODES) {
    registerShowModeMessageCommand(pi);
    registerHideModeMessageCommand(pi);
    registerExecuteCommand(pi);
    registerPlanCommand(pi);
    registerAskCommand(pi);
    registerCodeReviewCommand(pi);
    registerNormalCommand(pi);
    registerListPlansCommand(pi);
    registerDeletePlanCommand(pi);
    registerReadPlanCommand(pi);
    registerTogglePlanOutputCommand(pi);
    registerCodereviewPlanCommand(pi);
    registerPlanGetTool(pi);
    registerPlanListTool(pi);
    registerPlanCreateTool(pi);
    registerPlanEditTool(pi);
    registerPlanDeleteTool(pi);
    registerRequestBlockExemptionTool(pi);
  }

  // Diff
  registerDiffCommand(pi);

  // Tools
  registerSearchFilesTool(pi);
  registerSearchCodebaseTool(pi);

  // Event handlers
  registerBeforeAgentStartHandler(pi);
  registerCommandSafetyHandler(pi);

  // Shortcuts
  if (ENABLE_MODES) {
    registerModeCycle(pi);
  }
}
