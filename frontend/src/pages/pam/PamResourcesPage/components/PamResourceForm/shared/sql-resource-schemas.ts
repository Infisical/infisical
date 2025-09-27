import { z } from "zod";

export const BaseSqlResourceSchema = z.object({
  host: z.string().trim().min(1, "Host required"),
  port: z.coerce.number().default(5432),
  database: z.string().trim().min(1, "Database required").default("default"),
  sslEnabled: z.boolean().default(true),
  sslRejectUnauthorized: z.boolean().default(true),
  sslCertificate: z
    .string()
    .trim()
    .transform((value) => value || undefined)
    .optional()
});
