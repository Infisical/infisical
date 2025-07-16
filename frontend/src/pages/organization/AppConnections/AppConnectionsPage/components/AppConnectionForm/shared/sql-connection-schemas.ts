import { z } from "zod";

export const BaseSqlUsernameAndPasswordConnectionSchema = z.object({
  gatewayId: z.string().nullable().optional(),
  host: z.string().trim().min(1, "Host required"),
  port: z.coerce.number().default(5432),
  database: z.string().trim().min(1, "Database required").default("default"),
  username: z.string().trim().min(1, "Username required"),
  password: z.string().trim().min(1, "Password required"),
  sslEnabled: z.boolean().default(true),
  sslRejectUnauthorized: z.boolean().default(true),
  sslCertificate: z
    .string()
    .trim()
    .transform((value) => value || undefined)
    .optional()
});
