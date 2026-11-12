import { z } from "zod";

import { slugSchema } from "../slugSchema";

export const rotationSchema = z.object({
  rotationInterval: z
    .number()
    .min(1)
    .max(365 * 2.5),
  rotateAtUtc: z.object({
    hours: z.number().min(0).max(23),
    minutes: z.number().min(0).max(59)
  })
});

export const genericAppConnectionFieldsSchema = z.object({
  name: slugSchema({ min: 1, max: 64, field: "Name" }),
  description: z.string().trim().max(256, "Description cannot exceed 256 characters").nullish(),
  gatewayId: z
    .string()
    .nullish()
    .transform((v) => (v === "" ? null : v)),
  gatewayPoolId: z
    .string()
    .nullish()
    .transform((v) => (v === "" ? null : v)),
  isAutoRotationEnabled: z.boolean().optional(),
  rotation: rotationSchema.optional()
});

export const BaseSqlUsernameAndPasswordConnectionSchema = z.object({
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
