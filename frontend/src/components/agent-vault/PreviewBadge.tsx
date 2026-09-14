import { Badge, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import { ProjectType } from "@app/hooks/api/projects/types";

export const PreviewBadge = ({ type }: { type: ProjectType }) => {
  if (type !== ProjectType.AgentVault) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="info">Preview</Badge>
      </TooltipTrigger>
      <TooltipContent>
        Agent Vault is in preview and subject to change. Not recommended for production
        use.
      </TooltipContent>
    </Tooltip>
  );
};
