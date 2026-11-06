import { Badge, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";

export const BuiltinSkillBadge = () => (
  <Tooltip>
    <TooltipTrigger asChild data-row-interactive>
      <Badge variant="info">Built-in</Badge>
    </TooltipTrigger>
    <TooltipContent>
      Agent Vault gives this skill to every agent, and Infisical keeps it up to date.
    </TooltipContent>
  </Tooltip>
);
