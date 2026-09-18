import { z } from "zod";

import {
  CertKeySource,
  HSM_SUPPORTED_KEY_ALGORITHMS,
  SignerKeyAlgorithm
} from "@app/hooks/api/signers";
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
    // DigiCert code signing only: reissue into this existing order instead of placing a new one.
    reissueFromExternalOrderId: z.string().nullable().optional().default(null),
    // AD CS only: the certificate template this signer requests when issuing.
    adcsTemplate: z.string().trim().optional().default("")
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
  })
  .refine(
    (data) =>
      data.keySource !== CertKeySource.Hsm ||
      HSM_SUPPORTED_KEY_ALGORITHMS.includes(data.keyAlgorithm),
    {
      message:
        "This algorithm is not supported by HSM-backed keys. Pick RSA-2048, RSA-4096, ECDSA P-256, or ECDSA P-384.",
      path: ["keyAlgorithm"]
    }
  );
export type CertificateForm = z.infer<typeof certificateSchema>;
