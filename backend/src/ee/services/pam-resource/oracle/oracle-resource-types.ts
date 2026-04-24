import { z } from "zod";

import {
  OracleAccountCredentialsSchema,
  OracleAccountSchema,
  OracleResourceConnectionDetailsSchema,
  OracleResourceSchema
} from "./oracle-resource-schemas";

// Resources
export type TOracleResource = z.infer<typeof OracleResourceSchema>;
export type TOracleResourceConnectionDetails = z.infer<typeof OracleResourceConnectionDetailsSchema>;

// Accounts
export type TOracleAccount = z.infer<typeof OracleAccountSchema>;
export type TOracleAccountCredentials = z.infer<typeof OracleAccountCredentialsSchema>;

// Args for probeOracleTls in oracle-resource-fns.
export type TProbeOracleTlsArgs = {
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
};
