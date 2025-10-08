import { z } from "zod";

import {
  PostgresAccountCredentialsSchema,
  PostgresAccountSchema,
  PostgresResourceConnectionDetailsSchema,
  PostgresResourceSchema
} from "./postgres-resource-schemas";

// Resources
export type TPostgresResource = z.infer<typeof PostgresResourceSchema>;
export type TPostgresResourceConnectionDetails = z.infer<typeof PostgresResourceConnectionDetailsSchema>;

// Accounts
export type TPostgresAccount = z.infer<typeof PostgresAccountSchema>;
export type TPostgresAccountCredentials = z.infer<typeof PostgresAccountCredentialsSchema>;
