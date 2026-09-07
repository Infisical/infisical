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

// Derived from what was actually issued rather than what was asked for, so an audit log records the
// transports the gateway ended up with.
export const gatewayTransports = ({
  directAddress,
  relayHost
}: {
  directAddress?: string;
  relayHost?: string;
}): TGatewayTransport[] => {
  const transports: TGatewayTransport[] = [];
  if (directAddress) transports.push("direct");
  if (relayHost) transports.push("relay");
  return transports;
};

// Which transports a PAM client is given, from what the gateway has and what the client says it can
// dial. Extracted alongside resolveTransports so the matrix is testable without KMS or the relay
// service. `supportedTransports` undefined means the platform is dialling on the client's behalf
// (browser access) and any transport is fine; an empty array is an older CLI that only knows relays.
export const resolveClientTransports = ({
  gateway,
  supportedTransports
}: {
  gateway: {
    directAddress?: string | null;
    relayId?: string | null;
    directHeartbeat?: Date | null;
    heartbeatTTL?: number | null;
  };
  supportedTransports?: TGatewayTransport[];
}) => {
  const clientAllowsDirect = supportedTransports === undefined || supportedTransports.includes("direct");
  const allowRelay =
    supportedTransports === undefined || supportedTransports.length === 0 || supportedTransports.includes("relay");

  // A stale direct probe means the platform could not reach the address, so handing it out makes
  // every session pay the direct handshake timeout before falling back. Skipped only when the relay
  // can actually take over; otherwise it is the client's only path and a stale probe beats not
  // trying. Same rule resolveTransports applies to platform-side dials.
  const canFallBackToRelay = allowRelay && Boolean(gateway.relayId);
  const allowDirect =
    clientAllowsDirect &&
    (!canFallBackToRelay ||
      isTransportHealthy({ probedAt: gateway.directHeartbeat, heartbeatTTL: gateway.heartbeatTTL }));

  const useDirect = allowDirect && Boolean(gateway.directAddress);
  const useRelay = allowRelay && Boolean(gateway.relayId);

  return {
    allowDirect,
    allowRelay,
    useDirect,
    useRelay,
    hasTransport: useDirect || useRelay,
    // Separates "your client is too old for this gateway" from "this gateway has nothing to dial",
    // so the caller can tell the user which one it is.
    isDirectOnlyForOlderClient: Boolean(gateway.directAddress) && !gateway.relayId && !clientAllowsDirect,
    gatewayHasTransport: Boolean(gateway.directAddress || gateway.relayId)
  };
};
