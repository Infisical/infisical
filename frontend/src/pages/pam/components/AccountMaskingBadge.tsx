import { AlertTriangle } from "lucide-react";

import { Badge, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import { PamAccountWarning } from "@app/hooks/api/pam";

export const AccountMaskingBadge = ({ warnings }: { warnings: PamAccountWarning[] }) => {
  if (!warnings.includes(PamAccountWarning.SessionLogMaskingDegraded)) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="neutral">
          <AlertTriangle className="size-3" />
          Partial masking
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p>
          This account&apos;s template enables built-in detection, but the gateway serving it runs a
          version that doesn&apos;t support it. Recordings are masked by the template&apos;s custom
          patterns only until the gateway is upgraded.
        </p>
      </TooltipContent>
    </Tooltip>
  );
};
