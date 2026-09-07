import { format } from "date-fns";
import { CircleCheckIcon, CircleDashedIcon, CircleXIcon } from "lucide-react";

import { Badge, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import { getLastSeenHeartbeat, isGatewayHealthy } from "@app/hooks/api/gateways-v2/utils";

export const GatewayHealthStatus = ({
  heartbeat,
  relayId,
  directAddress,
  directHeartbeat,
  heartbeatTTL
}: {
  heartbeat?: string | null;
  relayId?: string | null;
  directAddress?: string | null;
  directHeartbeat?: string | null;
  heartbeatTTL?: number | null;
}) => {
  const lastSeen = getLastSeenHeartbeat({ heartbeat, directHeartbeat });
  if (!lastSeen && heartbeatTTL === null && !directAddress && !relayId) {
    return (
      <Badge variant="warning" iconPosition="left">
        <CircleDashedIcon />
        Unregistered
      </Badge>
    );
  }

  const heartbeatDate = lastSeen ? new Date(lastSeen) : null;
  const isHealthy = isGatewayHealthy({ heartbeat, directAddress, directHeartbeat, heartbeatTTL });

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant={isHealthy ? "success" : "danger"} iconPosition="left">
          {isHealthy ? <CircleCheckIcon /> : <CircleXIcon />}
          {isHealthy ? "Healthy" : "Unreachable"}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        {heartbeatDate ? `Last seen ${format(heartbeatDate, "PPp")}` : "No data available"}
      </TooltipContent>
    </Tooltip>
  );
};
