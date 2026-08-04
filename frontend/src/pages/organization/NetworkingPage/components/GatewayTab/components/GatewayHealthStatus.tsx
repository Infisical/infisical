import { format } from "date-fns";
import { CircleCheckIcon, CircleDashedIcon, CircleXIcon } from "lucide-react";

import { Badge, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import { isGatewayHealthy } from "@app/hooks/api/gateways-v2/utils";

export const GatewayHealthStatus = ({
  heartbeat,
  heartbeatTTL
}: {
  heartbeat?: string | null;
  heartbeatTTL?: number | null;
}) => {
  if (!heartbeat && !heartbeatTTL) {
    return (
      <Badge variant="warning" iconPosition="left">
        <CircleDashedIcon />
        Unregistered
      </Badge>
    );
  }

  const heartbeatDate = heartbeat ? new Date(heartbeat) : null;
  const isHealthy = isGatewayHealthy({ heartbeat, heartbeatTTL });

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
