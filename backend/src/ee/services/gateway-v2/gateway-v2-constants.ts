export const HEARTBEAT_BUFFER_SECONDS = 30;
export const DEFAULT_HEARTBEAT_TTL = 1800; // 30 minutes — fallback for old gateways that don't report their interval

export const GATEWAY_ROUTING_INFO_OID = "1.3.6.1.4.1.12345.100.1";
export const GATEWAY_ACTOR_OID = "1.3.6.1.4.1.12345.100.2";
// .100.3 is used twice: here for PAM session info on a gateway client certificate, and as
// RELAY_CONNECTING_GATEWAY_INFO on a relay certificate (see relay-constants.ts). It works only because
// those are different certificate types read by different parsers. Do not add a third meaning to an arc
// that is already in use; check both files before taking a new one.
export const PAM_INFO_OID = "1.3.6.1.4.1.12345.100.3";
// Pins a gateway client certificate to one agent gateway session. The gateway derives the session from
// this extension alone and ignores anything the client claims in band, which is what makes it impossible
// for one agent's connection to be served another agent's credentials.
export const AGENT_GATEWAY_INFO_OID = "1.3.6.1.4.1.12345.100.4";
// The agent gateway handler chooses its upstream per request inside the tunnel, so there is no single
// host:port to pin. A sentinel keeps the routing extension well-formed for parsers that expect it.
export const AGENT_GATEWAY_ROUTING_SENTINEL = "agent-gateway";
