import { IconType } from "react-icons";
import { SiAnthropic, SiGithubcopilot, SiGooglegemini, SiOpenai } from "react-icons/si";

import { SandboxAgentType } from "@app/hooks/api/sandboxes";

export const AGENT_ICONS: Record<SandboxAgentType, IconType> = {
  [SandboxAgentType.Gemini]: SiGooglegemini,
  [SandboxAgentType.Claude]: SiAnthropic,
  [SandboxAgentType.Codex]: SiOpenai,
  [SandboxAgentType.Copilot]: SiGithubcopilot
};
