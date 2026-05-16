import { faClock } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";

import { Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import { isGatewayHealthy } from "@app/hooks/api/gateways-v2/utils";

export const GatewayHealthStatus = ({
  heartbeat,
  heartbeatTTL,
  isPending,
  isExpired
}: {
  heartbeat?: string | null;
  heartbeatTTL?: number | null;
  isPending?: boolean;
  isExpired?: boolean;
}) => {
  if (isExpired) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex cursor-default items-center gap-1.5 text-red-400">
            Expired
          </span>
        </TooltipTrigger>
        <TooltipContent>
          Enrollment token has expired. Re-enroll to generate a new one.
        </TooltipContent>
      </Tooltip>
    );
  }

  if (isPending) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex cursor-default items-center gap-1.5 text-yellow-500">
            <FontAwesomeIcon icon={faClock} className="size-3" />
            Pending
          </span>
        </TooltipTrigger>
        <TooltipContent>Waiting for gateway to enroll using the CLI command</TooltipContent>
      </Tooltip>
    );
  }

  if (!heartbeat && !heartbeatTTL) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-default text-yellow-500">Unregistered</span>
        </TooltipTrigger>
        <TooltipContent>Gateway has not connected yet</TooltipContent>
      </Tooltip>
    );
  }

  const heartbeatDate = heartbeat ? new Date(heartbeat) : null;
  const isHealthy = isGatewayHealthy(heartbeat, heartbeatTTL);

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
