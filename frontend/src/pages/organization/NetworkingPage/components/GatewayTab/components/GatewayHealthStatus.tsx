import { format } from "date-fns";

import { Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import { isGatewayHealthy } from "@app/hooks/api/gateways-v2/utils";

export const GatewayHealthStatus = ({
  heartbeat,
  heartbeatTTL
}: {
  heartbeat?: string | null;
  heartbeatTTL?: number | null;
}) => {
  if (!heartbeat && !heartbeatTTL) {
    return <span className="cursor-default text-yellow-500">Unregistered</span>;
  }

  const heartbeatDate = heartbeat ? new Date(heartbeat) : null;
  const isHealthy = isGatewayHealthy({ heartbeat, heartbeatTTL });

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`cursor-default ${isHealthy ? "text-green-400" : "text-red-400"}`}>
          {isHealthy ? "Healthy" : "Unreachable"}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {heartbeatDate
          ? `Last seen: ${format(heartbeatDate, "PPpp")} (${heartbeatDate.toUTCString()})`
          : "No data available"}
      </TooltipContent>
    </Tooltip>
  );
};
