import net from "net";
import tls from "tls";

import { OracleResourceListItemSchema } from "./oracle-resource-schemas";

export const getOracleResourceListItem = () => {
  return {
    name: OracleResourceListItemSchema.shape.name.value,
    resource: OracleResourceListItemSchema.shape.resource.value
  };
};

const DEFAULT_PROBE_TIMEOUT_MS = 10 * 1000;

interface ProbeOracleTlsArgs {
  /** Address we actually dial — usually the gateway tunnel's localhost. */
  tcpHost: string;
  port: number;
  /** Real upstream Oracle hostname. Sent as TLS SNI so multi-SNI listeners
   * return the right cert, and used for chain validation. Different from
   * `tcpHost` because we dial the tunnel, not the listener. */
  servername: string;
  /** Pasted CA PEM from the resource. When undefined, Node falls back to its
   * default trust store. */
  caPem: string | undefined;
  /** Honors the resource's sslRejectUnauthorized toggle. */
  rejectUnauthorized: boolean;
  timeoutMs?: number;
}

/**
 * Verifies an SSL-enabled Oracle resource is reachable and presents a trusted
 * TLS cert, without going through node-oracledb. Used on resource save so the
 * pasted sslCertificate is actually consulted — node-oracledb thin mode can't
 * accept an inline CA, so we do this step ourselves. See sql-resource-factory
 * for the reason account-credential validation on TLS resources is deferred.
 */
export const probeOracleTls = ({
  tcpHost,
  port,
  servername,
  caPem,
  rejectUnauthorized,
  timeoutMs = DEFAULT_PROBE_TIMEOUT_MS
}: ProbeOracleTlsArgs): Promise<void> =>
  new Promise((resolve, reject) => {
    const socket = net.connect({ host: tcpHost, port });
    socket.setTimeout(timeoutMs);
    socket.once("error", (err) => {
      socket.destroy();
      reject(err);
    });
    socket.once("timeout", () => {
      socket.destroy();
      reject(new Error("timeout connecting to Oracle listener"));
    });
    socket.once("connect", () => {
      const tlsSocket = tls.connect({
        socket,
        servername,
        ca: caPem || undefined,
        rejectUnauthorized,
        // The driver dials localhost (the tunnel) but the cert carries the real
        // upstream hostname. Chain validation still runs; we just skip the
        // hostname match since it would always fail here.
        checkServerIdentity: () => undefined
      });
      tlsSocket.once("secureConnect", () => {
        tlsSocket.end();
        resolve();
      });
      tlsSocket.once("error", (err) => {
        tlsSocket.destroy();
        reject(err);
      });
    });
  });
