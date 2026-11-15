import { z } from "zod";

import {
  CertKeySource,
  HSM_SUPPORTED_KEY_ALGORITHMS,
  SignerKeyAlgorithm
} from "@app/hooks/api/signers";
import { slugSchema } from "@app/lib/schemas";

import {
  ExternalOrderMode,
  isUsingExistingCertificate
} from "../../../components/DigiCertExistingOrderField";

export const basicsSchema = z.object({
  name: slugSchema({ min: 1, max: 64, field: "Name" }),
  description: z.string().trim().max(256).optional().or(z.literal(""))
});
export type BasicsForm = z.infer<typeof basicsSchema>;

export type TCurrentSignerKey = {
  keyAlgorithm: SignerKeyAlgorithm;
  keySource: CertKeySource;
  hsmConnectorId: string | null;
  caId: string;
};

export const isSameKeyLocation = (
  data: { keySource: CertKeySource; hsmConnectorId?: string | null; caId: string },
  currentKey: TCurrentSignerKey
) =>
  data.keySource === currentKey.keySource &&
  (data.hsmConnectorId ?? null) === currentKey.hsmConnectorId &&
  data.caId === currentKey.caId;

export const createCertificateSchema = (currentKey: TCurrentSignerKey) =>
  z
    .object({
      caId: z.string().uuid("Certificate Authority is required"),
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
      commonName: z.string().trim().min(1, "Common Name is required").max(256).optional(),
      certificateTtlDays: z.coerce.number().int().min(1).max(3650).optional(),
      currentCertificateTtlDays: z.number().nullable().optional(),
      keySource: z.nativeEnum(CertKeySource).default(CertKeySource.Infisical),
      keyAlgorithm: z.nativeEnum(SignerKeyAlgorithm).default(SignerKeyAlgorithm.RSA_2048),
      hsmConnectorId: z.string().uuid().optional().nullable(),
      externalOrderId: z.string().nullable().optional().default(null),
      externalOrderMode: z.nativeEnum(ExternalOrderMode).default(ExternalOrderMode.Reissue),
      hsmKeyLabel: z.string().trim().max(128).optional().default(""),
      hsmKeyId: z.string().trim().max(256).optional().default(""),
      hsmKeyIdRequired: z.boolean().optional().default(false),
      hsmKeyUnresolved: z.boolean().optional().default(false),
      // AD CS only: the certificate template this signer requests when issuing.
      adcsTemplate: z.string().trim().optional().default("")
    })
    .refine(
      (data) => {
        if (data.certificateRenewBeforeDays == null || isUsingExistingCertificate(data))
          return true;
        const effectiveTtlDays = data.externalOrderId
          ? data.currentCertificateTtlDays
          : data.certificateTtlDays;
        return effectiveTtlDays == null || data.certificateRenewBeforeDays < effectiveTtlDays;
      },
      {
        message: "Renew before must be less than the certificate validity (days).",
        path: ["certificateRenewBeforeDays"]
      }
    )
    .refine((data) => data.keySource !== CertKeySource.Hsm || Boolean(data.hsmConnectorId), {
      message: "Pick an HSM Connector.",
      path: ["hsmConnectorId"]
    })
    .refine((data) => !isUsingExistingCertificate(data) || Boolean(data.hsmKeyLabel), {
      message: "Enter the label of the certificate's private key on the HSM.",
      path: ["hsmKeyLabel"]
    })
    .refine(
      (data) =>
        !isUsingExistingCertificate(data) || !data.hsmKeyIdRequired || Boolean(data.hsmKeyId),
      { message: "Select which key to use.", path: ["hsmKeyId"] }
    )
    .refine((data) => !isUsingExistingCertificate(data) || !data.hsmKeyUnresolved, {
      message: "Wait for the key lookup, or enter the label of a private key on the HSM.",
      path: ["hsmKeyLabel"]
    })
    .refine(
      (data) =>
        data.keySource !== CertKeySource.Hsm ||
        isUsingExistingCertificate(data) ||
        (isSameKeyLocation(data, currentKey) && data.keyAlgorithm === currentKey.keyAlgorithm) ||
        HSM_SUPPORTED_KEY_ALGORITHMS.includes(data.keyAlgorithm),
      {
        message:
          "This algorithm is not supported by HSM-backed keys. Pick RSA-2048, RSA-4096, ECDSA P-256, or ECDSA P-384.",
        path: ["keyAlgorithm"]
      }
    );
export type CertificateForm = z.infer<ReturnType<typeof createCertificateSchema>>;
