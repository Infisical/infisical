export const HEARTBEAT_BUFFER_SECONDS = 30;

export const isGatewayHealthy = (gateway: {
  heartbeat?: string | null;
  relayId: string | null;
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

  // Mirrors buildGatewayReachableSql: a transport counts only while it is still configured.
  return (
    (Boolean(gateway.directAddress) && isFresh(gateway.directHeartbeat)) ||
    (Boolean(gateway.relayId) && isFresh(gateway.heartbeat))
  );
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

export type TGatewayTransportHealth = {
  transport: "direct" | "relay";
  label: string;
  isHealthy: boolean;
  probedAt: string | null;
};

// The aggregate badge answers "is this gateway usable", not "which path is broken".
export const getGatewayTransportHealth = (gateway: {
  heartbeat?: string | null;
  relayId?: string | null;
  directAddress?: string | null;
  directHeartbeat?: string | null;
  heartbeatTTL?: number | null;
}): TGatewayTransportHealth[] => {
  const isFresh = (probedAt?: string | null) =>
    Boolean(gateway.heartbeatTTL) &&
    Boolean(probedAt) &&
    new Date(probedAt as string).getTime() +
      ((gateway.heartbeatTTL as number) + HEARTBEAT_BUFFER_SECONDS) * 1000 >
      Date.now();

  const transports: TGatewayTransportHealth[] = [];
  if (gateway.directAddress) {
    transports.push({
      transport: "direct",
      label: "Direct",
      isHealthy: isFresh(gateway.directHeartbeat),
      probedAt: gateway.directHeartbeat ?? null
    });
  }
  if (gateway.relayId) {
    transports.push({
      transport: "relay",
      label: "Relay",
      isHealthy: isFresh(gateway.heartbeat),
      probedAt: gateway.heartbeat ?? null
    });
  }
  return transports;
};
