import { ComponentProps } from "react";
import { TriangleAlertIcon } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import { TAgentVaultSession } from "@app/hooks/api/agentVault/types";

const LOSS_SHARE_THRESHOLD = 0.05;

export const SessionLogLossIndicator = ({
  counts,
  side,
  align
}: {
  counts: TAgentVaultSession["recentSessionLogCounts"];
  side?: ComponentProps<typeof TooltipContent>["side"];
  align?: ComponentProps<typeof TooltipContent>["align"];
}) => {
  const total = counts.recordedCount + counts.droppedCount;
  if (!total || counts.droppedCount / total < LOSS_SHARE_THRESHOLD) return null;

  const message = `Failed to record ${counts.droppedCount.toLocaleString()} ${counts.droppedCount === 1 ? "request" : "requests"} in the last 24 hours. Check the proxy's logs for details.`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span aria-label={message} className="flex text-warning">
          <TriangleAlertIcon className="size-4" />
        </span>
      </TooltipTrigger>
      <TooltipContent side={side} align={align} className="max-w-sm">
        {message}
      </TooltipContent>
    </Tooltip>
  );
};
