import { z } from "zod";

import { AppConnections } from "@app/lib/api-docs";

export const BaseSqlUsernameAndPasswordConnectionSchema = z.object({
  gatewayId: z.string().optional(),
  host: z.string().trim().min(1, "Host required").describe(AppConnections.CREDENTIALS.SQL_CONNECTION.host),
  port: z.coerce.number().describe(AppConnections.CREDENTIALS.SQL_CONNECTION.port),
  database: z.string().trim().min(1, "Database required").describe(AppConnections.CREDENTIALS.SQL_CONNECTION.database),
  username: z.string().trim().min(1, "Username required").describe(AppConnections.CREDENTIALS.SQL_CONNECTION.username),
  password: z.string().trim().min(1, "Password required").describe(AppConnections.CREDENTIALS.SQL_CONNECTION.password),
  sslEnabled: z.boolean().describe(AppConnections.CREDENTIALS.SQL_CONNECTION.sslEnabled),
  sslRejectUnauthorized: z.boolean().describe(AppConnections.CREDENTIALS.SQL_CONNECTION.sslRejectUnauthorized),
  sslCertificate: z
    .string()
    .trim()
    .transform((value) => value || undefined)
    .optional()
    .describe(AppConnections.CREDENTIALS.SQL_CONNECTION.sslCertificate)
});
