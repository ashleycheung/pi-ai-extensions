import { type ExtensionAPI } from "@mariozechner/pi-coding-agent";

// Commands
import { registerShowModeMessageCommand } from "./commands/show-mode-message";
import { registerHideModeMessageCommand } from "./commands/hide-mode-message";
import { registerExecuteCommand } from "./commands/execute";
import { registerPlanCommand } from "./commands/plan";
import { registerExploreCommand } from "./commands/explore";
import { registerCodeReviewCommand } from "./commands/code-review";
import { registerListPlansCommand } from "./commands/list-plans";
import { registerDeletePlanCommand } from "./commands/delete-plan";
import { registerDiffCommand } from "./commands/diff";
import { registerReadPlanCommand } from "./commands/read-plan";

// Tools
import { registerSearchFilesTool } from "./tools/search-files";
import { registerSearchCodebaseTool } from "./tools/search-codebase";
import { registerPlanGetTool } from "./tools/plan-get";
import { registerPlanListTool } from "./tools/plan-list";
import { registerPlanCreateTool } from "./tools/plan-create";
import { registerPlanEditTool } from "./tools/plan-edit";
import { registerPlanDeleteTool } from "./tools/plan-delete";

// Event handlers
import { registerBeforeAgentStartHandler } from "./events/before-agent-start";
import { registerCommandSafetyHandler } from "./events/command-safety";

export default function (pi: ExtensionAPI) {
  // Commands
  registerShowModeMessageCommand(pi);
  registerHideModeMessageCommand(pi);
  registerExecuteCommand(pi);
  registerPlanCommand(pi);
  registerExploreCommand(pi);
  registerCodeReviewCommand(pi);
  registerListPlansCommand(pi);
  registerDeletePlanCommand(pi);
  registerDiffCommand(pi);
  registerReadPlanCommand(pi);

  // Tools
  registerSearchFilesTool(pi);
  registerSearchCodebaseTool(pi);
  registerPlanGetTool(pi);
  registerPlanListTool(pi);
  registerPlanCreateTool(pi);
  registerPlanEditTool(pi);
  registerPlanDeleteTool(pi);

  // Event handlers
  registerBeforeAgentStartHandler(pi);
  registerCommandSafetyHandler(pi);
}
