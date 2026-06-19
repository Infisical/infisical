import { z } from "zod";

import { CertKeySource, HsmKeyAlgorithm, SignerKeyAlgorithm } from "@app/hooks/api/signers";
import { slugSchema } from "@app/lib/schemas";

export const basicsSchema = z.object({
  name: slugSchema({ min: 1, max: 64, field: "Name" }),
  description: z.string().trim().max(256).optional()
});
export type BasicsForm = z.infer<typeof basicsSchema>;

export const certificateSchema = z
  .object({
    caId: z.string().uuid("Certificate Authority is required"),
    commonName: z.string().trim().min(1, "Common Name is required").max(256),
    certificateTtlDays: z.coerce.number().int().min(1).max(3650).default(365),
    certificateRenewBeforeDays: z
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
    keyAlgorithm: z.nativeEnum(SignerKeyAlgorithm).default(SignerKeyAlgorithm.RSA_2048),
    keySource: z.nativeEnum(CertKeySource).default(CertKeySource.Infisical),
    hsmConnectorId: z.string().uuid().optional().nullable(),
    hsmKeyAlgorithm: z.nativeEnum(HsmKeyAlgorithm).default(HsmKeyAlgorithm.RSA_2048)
  })
  .refine(
    (data) =>
      data.certificateRenewBeforeDays == null ||
      data.certificateRenewBeforeDays < data.certificateTtlDays,
    {
      message: "Renew before must be less than the certificate validity (days).",
      path: ["certificateRenewBeforeDays"]
    }
  )
  .refine((data) => data.keySource !== CertKeySource.Hsm || Boolean(data.hsmConnectorId), {
    message: "Pick an HSM Connector.",
    path: ["hsmConnectorId"]
  });
export type CertificateForm = z.infer<typeof certificateSchema>;
