import { z } from "zod";

import {
  MAX_DISTRIBUTION_POINT_URL_LENGTH,
  MAX_INTERNAL_CA_DISTRIBUTION_POINT_URLS
} from "@app/hooks/api/ca";
import { InternalCaType } from "@app/hooks/api/ca/enums";
import { CertKeyAlgorithm } from "@app/hooks/api/certificates/enums";
import { CertKeySource } from "@app/hooks/api/signers";
import { slugSchema } from "@app/lib/schemas";

import { isKeyAlgorithmSupportedByKeySource } from "./types";

const isValidDate = (dateString: string) => !Number.isNaN(new Date(dateString).getTime());

const distributionPointUrlEntrySchema = z.object({
  value: z
    .string()
    .trim()
    .max(MAX_DISTRIBUTION_POINT_URL_LENGTH, "URL is too long")
    .url("Must be a valid URL")
    .refine((url) => /^https?:\/\//i.test(url), { message: "URL must use http:// or https://" })
});

const distributionPointUrlsSchema = z
  .array(distributionPointUrlEntrySchema)
  .max(
    MAX_INTERNAL_CA_DISTRIBUTION_POINT_URLS,
    `Up to ${MAX_INTERNAL_CA_DISTRIBUTION_POINT_URLS} URLs are allowed`
  )
  .superRefine((entries, ctx) => {
    const seen = new Set<string>();
    entries.forEach((entry, index) => {
      const normalized = entry.value.trim().replace(/\/+$/, "").toLowerCase();
      if (seen.has(normalized)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "value"],
          message: "Duplicate URL"
        });
      }
      seen.add(normalized);
    });
  });

export const caWizardSchema = z
  .object({
    name: slugSchema({ min: 1, max: 64, field: "Name" }),
    type: z.nativeEnum(InternalCaType).default(InternalCaType.ROOT),
    organization: z.string().trim().default(""),
    ou: z.string().trim().default(""),
    country: z.string().trim().default(""),
    province: z.string().trim().default(""),
    locality: z.string().trim().default(""),
    commonName: z.string().trim().default(""),
    keySource: z.nativeEnum(CertKeySource).default(CertKeySource.Infisical),
    hsmConnectorId: z.string().uuid().optional().nullable(),
    appConnectionId: z.string().uuid().optional().nullable(),
    region: z.string().optional().nullable(),
    keyAlgorithm: z.nativeEnum(CertKeyAlgorithm).default(CertKeyAlgorithm.ECDSA_P256),
    notAfter: z.string().trim().default(""),
    maxPathLength: z.string().default("-1"),
    isOcspEnabled: z.boolean().default(false),
    disableManagedCrlDistributionPointUrl: z.boolean().default(false),
    crlDistributionPointUrls: distributionPointUrlsSchema.default([])
  })
  .refine(
    (data) =>
      [
        data.commonName,
        data.organization,
        data.ou,
        data.country,
        data.province,
        data.locality
      ].some((field) => field !== ""),
    {
      message: "At least one subject field (Common Name, Organization, ...) must be set.",
      path: ["commonName"]
    }
  )
  .refine((data) => data.type !== InternalCaType.ROOT || isValidDate(data.notAfter), {
    message: "A valid expiry date is required for a Root CA.",
    path: ["notAfter"]
  })
  .refine((data) => data.keySource !== CertKeySource.Hsm || Boolean(data.hsmConnectorId), {
    message: "Pick an HSM Connector.",
    path: ["hsmConnectorId"]
  })
  .refine((data) => data.keySource !== CertKeySource.AwsKms || Boolean(data.appConnectionId), {
    message: "Pick an AWS connection.",
    path: ["appConnectionId"]
  })
  .refine((data) => data.keySource !== CertKeySource.AwsKms || Boolean(data.region), {
    message: "Pick an AWS region.",
    path: ["region"]
  })
  .refine((data) => isKeyAlgorithmSupportedByKeySource(data.keySource, data.keyAlgorithm), {
    message: "This algorithm is not supported by the selected key source.",
    path: ["keyAlgorithm"]
  });

export type CaWizardForm = z.infer<typeof caWizardSchema>;
