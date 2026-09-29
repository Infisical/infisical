import { TriangleAlertIcon } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import { TAgentVaultSession } from "@app/hooks/api/agentVault/types";

const LOSS_SHARE_THRESHOLD = 0.05;

export const SessionLogLossIndicator = ({
  counts
}: {
  counts: TAgentVaultSession["recentSessionLogCounts"];
}) => {
  const total = counts.recordedCount + counts.droppedCount;
  if (!total || counts.droppedCount / total < LOSS_SHARE_THRESHOLD) return null;

  const message = `Something went wrong while recording ${counts.droppedCount.toLocaleString()} ${counts.droppedCount === 1 ? "request" : "requests"} in this session's last 24 hours.`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span aria-label={message} className="flex text-warning">
          <TriangleAlertIcon className="size-4" />
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-sm">{message}</TooltipContent>
    </Tooltip>
  );
};
