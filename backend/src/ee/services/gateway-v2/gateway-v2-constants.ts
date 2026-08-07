export const HEARTBEAT_BUFFER_SECONDS = 30;
export const DEFAULT_HEARTBEAT_TTL = 1800; // 30 minutes — fallback for old gateways that don't report their interval

/**
 * Gateway certificates are minted just-in-time and verified by gateways and relays on hosts whose
 * clocks we do not control. A notBefore of "now" makes a fresh certificate look not-yet-valid to any
 * host running even fractionally behind us, so backdate it by a tolerance instead.
 */
export const CERT_CLOCK_SKEW_MS = 5 * 60 * 1000;

export const getNotBeforeWithClockSkew = (issuedAt: Date) => new Date(issuedAt.getTime() - CERT_CLOCK_SKEW_MS);

export const GATEWAY_ROUTING_INFO_OID = "1.3.6.1.4.1.12345.100.1";
export const GATEWAY_ACTOR_OID = "1.3.6.1.4.1.12345.100.2";
export const PAM_INFO_OID = "1.3.6.1.4.1.12345.100.3";
