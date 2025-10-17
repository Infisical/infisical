import { z } from "zod";

import {
  MySQLAccountCredentialsSchema,
  MySQLAccountSchema,
  MySQLResourceConnectionDetailsSchema,
  MySQLResourceSchema
} from "./mysql-resource-schemas";

// Resources
export type TMySQLResource = z.infer<typeof MySQLResourceSchema>;
export type TMySQLResourceConnectionDetails = z.infer<typeof MySQLResourceConnectionDetailsSchema>;

// Accounts
export type TMySQLAccount = z.infer<typeof MySQLAccountSchema>;
export type TMySQLAccountCredentials = z.infer<typeof MySQLAccountCredentialsSchema>;
