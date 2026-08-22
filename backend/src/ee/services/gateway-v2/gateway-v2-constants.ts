export const HEARTBEAT_BUFFER_SECONDS = 30;
export const CERT_NOT_BEFORE_BACKDATE_MS = 30_000; // 30s backdate to tolerate clock skew between server and gateway
export const DEFAULT_HEARTBEAT_TTL = 1800; // 30 minutes — fallback for old gateways that don't report their interval

export const GATEWAY_ROUTING_INFO_OID = "1.3.6.1.4.1.12345.100.1";
export const GATEWAY_ACTOR_OID = "1.3.6.1.4.1.12345.100.2";
export const PAM_INFO_OID = "1.3.6.1.4.1.12345.100.3";
