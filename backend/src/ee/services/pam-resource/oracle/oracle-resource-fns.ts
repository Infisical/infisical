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

// TLS reachability + cert chain check. node-oracledb thin can't accept an inline CA.
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
        rejectUnauthorized
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
