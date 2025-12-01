import { z } from "zod";

// Resources
export const BaseSqlResourceConnectionDetailsSchema = z.object({
  host: z.string().trim().min(1).max(255),
  port: z.coerce.number(),
  database: z.string().trim().min(1).max(255),
  sslEnabled: z.boolean(),
  sslRejectUnauthorized: z.boolean(),
  sslCertificate: z
    .string()
    .trim()
    .transform((value) => value || undefined)
    .optional()
});

// Accounts
export const BaseSqlAccountCredentialsSchema = z.object({
  username: z.string().trim().min(1).max(63),
  password: z.string().trim().min(1).max(256),
  readOnlyMode: z.boolean().optional()
});
