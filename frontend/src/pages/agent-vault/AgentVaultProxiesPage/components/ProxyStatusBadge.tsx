import { format, formatDistanceToNowStrict } from "date-fns";
import { CircleCheckIcon, CircleDashedIcon, CircleSlashIcon } from "lucide-react";

import { Badge, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import { TAgentVaultProxy } from "@app/hooks/api/agentVault/types";

export const ProxyStatusBadge = ({ proxy }: { proxy: TAgentVaultProxy }) => {
  if (!proxy.heartbeat) {
    return (
      <Badge variant="neutral">
        <CircleDashedIcon />
        {proxy.rootCaFingerprint ? "Not connected" : "Never enrolled"}
      </Badge>
    );
  }

  const heartbeat = new Date(proxy.heartbeat);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant={proxy.isHealthy ? "success" : "warning"}>
          {proxy.isHealthy ? <CircleCheckIcon /> : <CircleSlashIcon />}
          {proxy.isHealthy ? "Healthy" : "Unreachable"} · {formatDistanceToNowStrict(heartbeat)} ago
        </Badge>
      </TooltipTrigger>
      <TooltipContent>Last seen {format(heartbeat, "MMM d, yyyy h:mm a")}</TooltipContent>
    </Tooltip>
  );
};
