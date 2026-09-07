export const HEARTBEAT_BUFFER_SECONDS = 30;
export const DEFAULT_HEARTBEAT_TTL = 1800; // 30 minutes — fallback for old gateways that don't report their interval

export const GATEWAY_ROUTING_INFO_OID = "1.3.6.1.4.1.12345.100.1";
export const GATEWAY_ACTOR_OID = "1.3.6.1.4.1.12345.100.2";
export const PAM_INFO_OID = "1.3.6.1.4.1.12345.100.3";

// A transport counts as usable while its last successful probe is inside the TTL window. A gateway
// that has never been probed on a transport is treated as usable so a freshly registered gateway is
// not locked out before its first heartbeat.
export const isTransportHealthy = ({
  probedAt,
  heartbeatTTL
}: {
  probedAt?: Date | null;
  heartbeatTTL?: number | null;
}) => {
  if (heartbeatTTL === 0) return false;
  if (!probedAt) return true;
  const staleAfterMs = ((heartbeatTTL ?? 0) + HEARTBEAT_BUFFER_SECONDS) * 1000;
  return Date.now() - new Date(probedAt).getTime() <= staleAfterMs;
};

// A gateway is reachable while any transport it has configured has a fresh probe. Checking only the
// preferred transport takes a dual-transport gateway offline the moment its direct address breaks,
// even though the platform keeps serving it over the relay.
export const buildGatewayReachableSql = (table: string) => {
  const isFresh = (probe: string) =>
    `("${table}"."${probe}" IS NOT NULL AND "${table}"."${probe}" + make_interval(secs => COALESCE("${table}"."heartbeatTTL", 0) + ${HEARTBEAT_BUFFER_SECONDS}) > NOW())`;

  return `(COALESCE("${table}"."heartbeatTTL", 0) > 0 AND (("${table}"."directAddress" IS NOT NULL AND ${isFresh(
    "directHeartbeat"
  )}) OR ("${table}"."relayId" IS NOT NULL AND ${isFresh("heartbeat")})))`;
};

// Whether the gateway has ever been probed on any transport, so one that was registered but never
// health-checked is not reported as having gone offline. Deliberately ignores which transports are
// configured now: a gateway whose relay was deleted keeps a probe but no transport, and that is
// exactly the state an operator needs to hear about.
export const buildGatewayProbedSql = (table: string) =>
  `("${table}"."directHeartbeat" IS NOT NULL OR "${table}"."heartbeat" IS NOT NULL)`;

export type TGatewayTransport = "direct" | "relay";

// Decides which transports a dial is given credentials for. Extracted so the matrix can be tested
// without standing up KMS and the relay service.
export const resolveTransports = ({
  gateway,
  transport
}: {
  gateway: {
    directAddress?: string | null;
    relayId?: string | null;
    directHeartbeat?: Date | null;
    heartbeatTTL?: number | null;
  };
  transport?: TGatewayTransport;
}) => {
  // An explicit transport is honoured as asked, since health probes must target one path. Otherwise
  // direct is preferred, but only while its last probe is fresh: a gateway whose direct address
  // broke keeps serving traffic over its relay instead of failing every operation.
  const directUsable =
    Boolean(gateway.directAddress) &&
    (transport === "direct" ||
      !gateway.relayId ||
      isTransportHealthy({ probedAt: gateway.directHeartbeat, heartbeatTTL: gateway.heartbeatTTL }));
  const useDirect = transport !== "relay" && directUsable;
  // Relay credentials ride along on a dual-transport gateway even when direct is chosen, so the dial
  // can retry over the relay when the direct address fails before its probe marks it stale.
  const useRelay = transport !== "direct" && Boolean(gateway.relayId);

  // Asking for a transport the gateway does not have leaves nothing selected, so the caller has to
  // fail here rather than dial with no credentials.
  return { useDirect, useRelay, hasTransport: useDirect || useRelay };
};
