import { isIP } from "node:net";
import tls from "node:tls";

// Node 26 throws when servername is an IP (SNI cannot carry one, RFC 6066). Earlier versions skipped the
// SNI but still verified the certificate against that IP, so keep the check: many callers dial a local
// gateway proxy, where Node would otherwise verify against "localhost".
export const getTlsServerNameOptions = (
  host?: string
): Pick<tls.ConnectionOptions, "servername" | "checkServerIdentity"> => {
  if (!host || !isIP(host)) return { servername: host };
  return { checkServerIdentity: (_hostname, cert) => tls.checkServerIdentity(host, cert) };
};
