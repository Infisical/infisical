import { z } from "zod";

import {
  MAX_DISTRIBUTION_POINT_URL_LENGTH,
  MAX_INTERNAL_CA_DISTRIBUTION_POINT_URLS
} from "@app/hooks/api/ca";
import { InternalCaType } from "@app/hooks/api/ca/enums";
import { CertKeyAlgorithm } from "@app/hooks/api/certificates/enums";
import { CertKeySource } from "@app/hooks/api/signers";
import { slugSchema } from "@app/lib/schemas";

import { HSM_SUPPORTED_CA_KEY_ALGORITHMS } from "./types";

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
    keyAlgorithm: z.nativeEnum(CertKeyAlgorithm).default(CertKeyAlgorithm.RSA_2048),
    notAfter: z.string().trim().default(""),
    maxPathLength: z.string().default("-1"),
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
  .refine(
    (data) =>
      data.keySource !== CertKeySource.Hsm ||
      HSM_SUPPORTED_CA_KEY_ALGORITHMS.includes(data.keyAlgorithm),
    {
      message:
        "This algorithm is not supported by HSM-backed keys. Pick RSA 2048, RSA 4096, ECDSA P256, or ECDSA P384.",
      path: ["keyAlgorithm"]
    }
  );

export type CaWizardForm = z.infer<typeof caWizardSchema>;
