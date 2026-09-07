export const HEARTBEAT_BUFFER_SECONDS = 30;

export const isGatewayHealthy = (gateway: {
  heartbeat?: string | null;
  directAddress?: string | null;
  directHeartbeat?: string | null;
  heartbeatTTL?: number | null;
}): boolean => {
  if (!gateway.heartbeatTTL) return false;

  const isFresh = (probedAt?: string | null) =>
    Boolean(probedAt) &&
    new Date(probedAt as string).getTime() +
      ((gateway.heartbeatTTL as number) + HEARTBEAT_BUFFER_SECONDS) * 1000 >
      Date.now();

  // A gateway running both transports is reachable while either path is fresh, since the platform
  // falls back to the relay when the direct address is down.
  if (gateway.directAddress) return isFresh(gateway.directHeartbeat) || isFresh(gateway.heartbeat);
  return isFresh(gateway.heartbeat);
};

export const getLastSeenHeartbeat = (gateway: {
  heartbeat?: string | null;
  directHeartbeat?: string | null;
}): string | null => {
  const probes = [gateway.directHeartbeat, gateway.heartbeat].filter(Boolean) as string[];
  if (!probes.length) return null;
  return probes.reduce((latest, probe) =>
    new Date(probe).getTime() > new Date(latest).getTime() ? probe : latest
  );
};
