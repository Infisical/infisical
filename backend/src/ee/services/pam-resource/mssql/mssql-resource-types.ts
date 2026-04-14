import { z } from "zod";

import {
  MsSQLAccountCredentialsSchema,
  MsSQLAccountSchema,
  MsSQLResourceConnectionDetailsSchema,
  MsSQLResourceSchema
} from "./mssql-resource-schemas";

// Resources
export type TMsSQLResource = z.infer<typeof MsSQLResourceSchema>;
export type TMsSQLResourceConnectionDetails = z.infer<typeof MsSQLResourceConnectionDetailsSchema>;

// Accounts
export type TMsSQLAccount = z.infer<typeof MsSQLAccountSchema>;
export type TMsSQLAccountCredentials = z.infer<typeof MsSQLAccountCredentialsSchema>;
