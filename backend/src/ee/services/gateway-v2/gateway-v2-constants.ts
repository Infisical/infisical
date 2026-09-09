import net from "node:net";

import RE2 from "re2";

import { BadRequestError } from "@app/lib/errors";

export const HEARTBEAT_BUFFER_SECONDS = 30;
export const DEFAULT_HEARTBEAT_TTL = 1800; // 30 minutes — fallback for old gateways that don't report their interval

export const GATEWAY_ROUTING_INFO_OID = "1.3.6.1.4.1.12345.100.1";
export const GATEWAY_ACTOR_OID = "1.3.6.1.4.1.12345.100.2";
export const PAM_INFO_OID = "1.3.6.1.4.1.12345.100.3";

// Never probed counts as usable, so a freshly registered gateway is not locked out.
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

// Any configured transport with a fresh probe, so a dual gateway stays up when one path breaks.
export const buildGatewayReachableSql = (table: string) => {
  const isFresh = (probe: string) =>
    `("${table}"."${probe}" IS NOT NULL AND "${table}"."${probe}" + make_interval(secs => COALESCE("${table}"."heartbeatTTL", 0) + ${HEARTBEAT_BUFFER_SECONDS}) > NOW())`;

  return `(COALESCE("${table}"."heartbeatTTL", 0) > 0 AND (("${table}"."directAddress" IS NOT NULL AND ${isFresh(
    "directHeartbeat"
  )}) OR ("${table}"."relayId" IS NOT NULL AND ${isFresh("heartbeat")})))`;
};

// Ignores which transports are configured now: a gateway whose relay was deleted still needs alerting.
export const buildGatewayProbedSql = (table: string) =>
  `("${table}"."directHeartbeat" IS NOT NULL OR "${table}"."heartbeat" IS NOT NULL)`;

export enum GatewayTransport {
  Direct = "direct",
  Relay = "relay"
}

export type TGatewayTransport = GatewayTransport;

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
  const directUsable =
    Boolean(gateway.directAddress) &&
    (transport === GatewayTransport.Direct ||
      !gateway.relayId ||
      isTransportHealthy({ probedAt: gateway.directHeartbeat, heartbeatTTL: gateway.heartbeatTTL }));
  const useDirect = transport !== GatewayTransport.Relay && directUsable;
  // Relay credentials ride along even when direct is chosen, so a dial can retry before the probe goes stale.
  const useRelay = transport !== GatewayTransport.Direct && Boolean(gateway.relayId);

  return { useDirect, useRelay, hasTransport: useDirect || useRelay };
};

export const gatewayTransports = ({
  directAddress,
  relayHost
}: {
  directAddress?: string;
  relayHost?: string;
}): TGatewayTransport[] => {
  const transports: TGatewayTransport[] = [];
  if (directAddress) transports.push(GatewayTransport.Direct);
  if (relayHost) transports.push(GatewayTransport.Relay);
  return transports;
};

// undefined means the platform dials on the client's behalf; [] is an older CLI that only knows relays.
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
  const clientAllowsDirect = supportedTransports === undefined || supportedTransports.includes(GatewayTransport.Direct);
  const allowRelay =
    supportedTransports === undefined ||
    supportedTransports.length === 0 ||
    supportedTransports.includes(GatewayTransport.Relay);

  // Skip a stale direct address only when the relay can take over; otherwise it is the client's only path.
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
    isDirectOnlyForOlderClient: Boolean(gateway.directAddress) && !gateway.relayId && !clientAllowsDirect,
    gatewayHasTransport: Boolean(gateway.directAddress || gateway.relayId)
  };
};

export const DNS_LABEL_REGEX = new RE2(/^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/);
const TRAILING_DOT_REGEX = new RE2(/\.$/);

// The address lands in copy-and-run deploy commands, so a host carrying shell syntax must not pass.
export const isValidDirectHost = (host: string) => {
  if (net.isIP(host)) return true;
  if (host.length > 253) return false;
  const labels = host.replace(TRAILING_DOT_REGEX, "").split(".");
  return labels.length > 0 && labels.every((label) => DNS_LABEL_REGEX.test(label));
};

export const parseDirectAddress = (address: string) => {
  // Never echo the address: it can arrive shaped like a connection string.
  const invalidFormat = () =>
    new BadRequestError({
      message: "Gateway direct address must use the host:port format, such as gateway.internal:8443"
    });

  let parsed: URL;
  try {
    parsed = new URL(`tcp://${address}`);
  } catch {
    throw invalidFormat();
  }

  if (
    !parsed.hostname ||
    !parsed.port ||
    parsed.username ||
    parsed.password ||
    parsed.pathname ||
    parsed.search ||
    parsed.hash
  ) {
    throw invalidFormat();
  }

  const port = Number(parsed.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new BadRequestError({ message: "Gateway direct address must include a port from 1 to 65535" });
  }

  const host = parsed.hostname.startsWith("[") ? parsed.hostname.slice(1, -1) : parsed.hostname;
  if (!isValidDirectHost(host)) {
    throw new BadRequestError({
      message: "Gateway direct address host must be an IP address or a DNS hostname"
    });
  }

  return { host, port };
};
