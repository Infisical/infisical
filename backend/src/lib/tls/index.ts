import { isIP } from "node:net";
import tls from "node:tls";

// URL.hostname keeps the brackets around an IPv6 literal, which isIP and checkServerIdentity do not accept.
export const stripIpv6Brackets = (host: string) =>
  host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;

// Node 26 throws when servername is an IP (SNI cannot carry one, RFC 6066). Earlier versions still sent the
// IP as SNI, so omitting it changes what the server sees (no SNI, or "localhost" from an https.Agent with no
// Host header). Keep the certificate check against the IP: many callers dial a local gateway proxy, where
// Node would otherwise verify against "localhost".
export const getTlsServerNameOptions = (
  host?: string
): Pick<tls.ConnectionOptions, "servername" | "checkServerIdentity"> => {
  if (!host) return { servername: host };
  const ip = stripIpv6Brackets(host);
  if (!isIP(ip)) return { servername: host };
  return { checkServerIdentity: (_hostname, cert) => tls.checkServerIdentity(ip, cert) };
};
