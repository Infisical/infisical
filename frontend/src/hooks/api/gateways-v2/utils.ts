export const HEARTBEAT_BUFFER_SECONDS = 30;

export const isGatewayHealthy = (
  heartbeat?: string | null,
  heartbeatTTL?: number | null
): boolean => {
  if (!heartbeat) return false;
  if (!heartbeatTTL) return false;
  return (
    new Date(heartbeat).getTime() + (heartbeatTTL + HEARTBEAT_BUFFER_SECONDS) * 1000 > Date.now()
  );
};
