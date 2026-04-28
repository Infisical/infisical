import { faClock } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Tooltip } from "@app/components/v2";
import { GatewayHealthCheckStatus } from "@app/hooks/api/gateways-v2/types";

export const GatewayHealthStatus = ({
  heartbeat,
  lastHealthCheckStatus,
  isPending,
  isExpired
}: {
  heartbeat?: string | null;
  lastHealthCheckStatus?: GatewayHealthCheckStatus | null;
  isPending?: boolean;
  isExpired?: boolean;
}) => {
  if (isExpired) {
    return (
      <Tooltip content="Enrollment token has expired. Re-enroll to generate a new one.">
        <span className="inline-flex cursor-default items-center gap-1.5 text-red-400">
          Expired
        </span>
      </Tooltip>
    );
  }

  if (isPending) {
    return (
      <Tooltip content="Waiting for gateway to enroll using the CLI command">
        <span className="inline-flex cursor-default items-center gap-1.5 text-yellow-500">
          <FontAwesomeIcon icon={faClock} className="size-3" />
          Pending
        </span>
      </Tooltip>
    );
  }

  if (!heartbeat && !lastHealthCheckStatus) {
    return (
      <Tooltip content="Gateway has not connected yet">
        <span className="cursor-default text-yellow-500">Unregistered</span>
      </Tooltip>
    );
  }

  const heartbeatDate = heartbeat ? new Date(heartbeat) : null;

  const isHealthy = lastHealthCheckStatus === GatewayHealthCheckStatus.Healthy;

  const tooltipContent = heartbeatDate
    ? `Last health check: ${heartbeatDate.toLocaleString()}`
    : "No health check data available";

  return (
    <Tooltip content={tooltipContent}>
      <span className={`cursor-default ${isHealthy ? "text-green-400" : "text-red-400"}`}>
        {isHealthy ? "Healthy" : "Unreachable"}
      </span>
    </Tooltip>
  );
};
