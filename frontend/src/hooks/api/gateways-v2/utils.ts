import { GatewayHealthCheckStatus } from "./types";

export const GATEWAY_HEARTBEAT_TIMEOUT_MS = 5 * 60 * 1000;

export const isGatewayHealthy = (
  heartbeat?: string | null,
  lastHealthCheckStatus?: GatewayHealthCheckStatus | string | null
): boolean => {
  if (!heartbeat) return false;
  const isHeartbeatFresh =
    new Date(heartbeat).getTime() > Date.now() - GATEWAY_HEARTBEAT_TIMEOUT_MS;
  const isNotFailed =
    !lastHealthCheckStatus || lastHealthCheckStatus !== GatewayHealthCheckStatus.Failed;
  return isHeartbeatFresh && isNotFailed;
};
