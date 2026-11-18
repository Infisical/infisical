import { ReactElement } from "react";
import { AlertTriangleIcon } from "lucide-react";

import {
  Badge,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@app/components/v3";

export const BadgeWithTooltip = ({
  tooltip,
  children
}: {
  tooltip: string | null;
  children: ReactElement;
}) => {
  if (!tooltip) return children;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help">{children}</span>
        </TooltipTrigger>
        <TooltipContent className="max-w-[320px] text-pretty break-words">{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export const SignerRequestFailedBadge = ({ reason }: { reason: string | null | undefined }) => (
  <BadgeWithTooltip
    tooltip={`${(reason ?? "").replace(/\.$/, "")}. The signer still has its current certificate.`}
  >
    <Badge variant="warning">
      <AlertTriangleIcon />
      Request Failed
    </Badge>
  </BadgeWithTooltip>
);
