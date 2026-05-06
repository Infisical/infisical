import { z } from "zod";

import {
  OracleAccountCredentialsSchema,
  OracleAccountSchema,
  OracleResourceConnectionDetailsSchema,
  OracleResourceSchema
} from "./oracle-resource-schemas";

export type TOracleResource = z.infer<typeof OracleResourceSchema>;
export type TOracleResourceConnectionDetails = z.infer<typeof OracleResourceConnectionDetailsSchema>;
export type TOracleAccount = z.infer<typeof OracleAccountSchema>;
export type TOracleAccountCredentials = z.infer<typeof OracleAccountCredentialsSchema>;

export type TProbeOracleTlsArgs = {
  tcpHost: string;
  port: number;
  servername: string;
  caPem: string | undefined;
  rejectUnauthorized: boolean;
  timeoutMs?: number;
};
