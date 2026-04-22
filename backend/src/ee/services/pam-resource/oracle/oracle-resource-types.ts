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
