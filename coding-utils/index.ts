import { type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerModeCommands, registerBeforeAgentStartHandler } from "./mode";
import { registerPlanCommands } from "./plan-commands";
import { registerPlanTools } from "./plan-tools";
import { registerCommandSafetyHandler } from "./command-safety";

export default function (pi: ExtensionAPI) {
  registerModeCommands(pi);
  registerBeforeAgentStartHandler(pi);
  registerPlanCommands(pi);
  registerPlanTools(pi);
  registerCommandSafetyHandler(pi);
}
