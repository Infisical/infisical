export const HEARTBEAT_BUFFER_SECONDS = 30;

export const isGatewayHealthy = (gateway: {
  heartbeat?: string | null;
  heartbeatTTL?: number | null;
}): boolean => {
  if (!gateway.heartbeat) return false;
  if (!gateway.heartbeatTTL) return false;
  return (
    new Date(gateway.heartbeat).getTime() +
      (gateway.heartbeatTTL + HEARTBEAT_BUFFER_SECONDS) * 1000 >
    Date.now()
  );
};
