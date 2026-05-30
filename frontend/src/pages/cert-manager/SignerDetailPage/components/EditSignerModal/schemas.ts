import { z } from "zod";

import { slugSchema } from "@app/lib/schemas";

export const basicsSchema = z.object({
  name: slugSchema({ min: 1, max: 64, field: "Name" }),
  description: z.string().trim().max(256).optional().or(z.literal(""))
});
export type BasicsForm = z.infer<typeof basicsSchema>;

export const certificateSchema = z
  .object({
    caId: z.string().uuid("Certificate Authority is required"),
    renewBeforeDays: z
      .preprocess(
        (v) => {
          if (v === "" || v === null || v === undefined) return null;
          const n = typeof v === "number" ? v : Number(v);
          return Number.isNaN(n) ? v : n;
        },
        z.union([
          z
            .number()
            .int("Must be a whole number of days")
            .min(1, "Must be at least 1 day")
            .max(30, "Must be at most 30 days"),
          z.null()
        ])
      )
      .default(null),
    commonName: z.string().trim().min(1, "Common Name is required").max(256).optional(),
    certificateTtlDays: z.coerce.number().int().min(1).max(3650).optional()
  })
  .refine(
    (data) =>
      data.renewBeforeDays == null ||
      data.certificateTtlDays == null ||
      data.renewBeforeDays < data.certificateTtlDays,
    {
      message: "Renew before must be less than the certificate validity (days).",
      path: ["renewBeforeDays"]
    }
  );
export type CertificateForm = z.infer<typeof certificateSchema>;
