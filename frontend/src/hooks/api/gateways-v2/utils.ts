export const HEARTBEAT_BUFFER_SECONDS = 30;

export const isGatewayHealthy = (gateway: {
  heartbeat?: string | null;
  directAddress?: string | null;
  directHeartbeat?: string | null;
  heartbeatTTL?: number | null;
}): boolean => {
  const heartbeat = gateway.directAddress ? gateway.directHeartbeat : gateway.heartbeat;
  if (!heartbeat) return false;
  if (!gateway.heartbeatTTL) return false;
  return (
    new Date(heartbeat).getTime() + (gateway.heartbeatTTL + HEARTBEAT_BUFFER_SECONDS) * 1000 >
    Date.now()
  );
};
