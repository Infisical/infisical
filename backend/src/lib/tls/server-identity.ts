import net from "node:net";
import tls from "node:tls";

export type TTlsServerIdentityOptions = Pick<tls.ConnectionOptions, "servername" | "checkServerIdentity">;

// SNI carries host names only (RFC 6066) and Node 26 throws when servername is an IP literal.
// Dropping servername alone is not enough: Node would then verify the certificate against the
// socket's host, which is "localhost" for a connection tunnelled through a gateway. An IP is
// instead matched against the certificate's IP SANs explicitly, as Node did before it threw.
export const getTlsServerIdentityOptions = (host: string | undefined): TTlsServerIdentityOptions => {
  if (!host) return {};

  const address = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  if (!net.isIP(address)) return { servername: host };

  return { checkServerIdentity: (_hostname, cert) => tls.checkServerIdentity(address, cert) };
};
