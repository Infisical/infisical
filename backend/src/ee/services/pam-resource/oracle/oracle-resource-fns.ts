import net from "net";
import tls from "tls";

import { ORACLE_TLS_PROBE_TIMEOUT_MS } from "./oracle-resource-constants";
import { OracleResourceListItemSchema } from "./oracle-resource-schemas";
import { TProbeOracleTlsArgs } from "./oracle-resource-types";

export const getOracleResourceListItem = () => {
  return {
    name: OracleResourceListItemSchema.shape.name.value,
    resource: OracleResourceListItemSchema.shape.resource.value
  };
};

/**
 * Verifies an SSL-enabled Oracle resource is reachable and presents a trusted
 * TLS cert, without going through node-oracledb. Used on resource save and
 * account save so the pasted sslCertificate is actually consulted —
 * node-oracledb thin mode can't accept an inline CA, so we do this step
 * ourselves. See sql-resource-factory for the reason account-credential
 * validation on TLS resources is deferred beyond this reachability check.
 */
export const probeOracleTls = ({
  tcpHost,
  port,
  servername,
  caPem,
  rejectUnauthorized,
  timeoutMs = ORACLE_TLS_PROBE_TIMEOUT_MS
}: TProbeOracleTlsArgs): Promise<void> =>
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
