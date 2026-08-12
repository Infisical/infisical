import { IconType } from "react-icons";
import { SiGithub, SiLinear, SiOpenai, SiSlack, SiStripe } from "react-icons/si";
import { GlobeIcon } from "lucide-react";

import { SandboxIntegrationType } from "@app/hooks/api/sandboxes";

/**
 * Brand marks come from react-icons/si, the same source the dynamic secret form uses. Custom has no
 * brand, so it falls back to a lucide glyph.
 */
export const INTEGRATION_ICONS: Record<SandboxIntegrationType, IconType> = {
  [SandboxIntegrationType.GitHub]: SiGithub,
  [SandboxIntegrationType.Slack]: SiSlack,
  [SandboxIntegrationType.Stripe]: SiStripe,
  [SandboxIntegrationType.Linear]: SiLinear,
  [SandboxIntegrationType.OpenAI]: SiOpenai,
  [SandboxIntegrationType.Custom]: GlobeIcon as IconType
};
