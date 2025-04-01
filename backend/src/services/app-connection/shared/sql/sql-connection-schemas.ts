import { z } from "zod";

import { AppConnections } from "@app/lib/api-docs";

export const BaseSqlUsernameAndPasswordConnectionSchema = z.object({
  host: z.string().trim().min(1, "Host required").describe(AppConnections.CREDENTIALS.SQL_CONNECTION.host),
  port: z.coerce.number().describe(AppConnections.CREDENTIALS.SQL_CONNECTION.port),
  database: z.string().trim().min(1, "Database required").describe(AppConnections.CREDENTIALS.SQL_CONNECTION.database),
  username: z.string().trim().min(1, "Username required").describe(AppConnections.CREDENTIALS.SQL_CONNECTION.username),
  password: z.string().trim().min(1, "Password required").describe(AppConnections.CREDENTIALS.SQL_CONNECTION.password),
  sslCertificate: z.string().trim().optional().describe(AppConnections.CREDENTIALS.SQL_CONNECTION.sslCertificate)
});
