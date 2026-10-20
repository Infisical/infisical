import { z } from "zod";

import { PkiSync } from "@app/hooks/api/pkiSyncs";

import { BasePkiSyncSchema } from "./base-pki-sync-schema";

const PAN_OS_OBJECT_NAME_REGEX = /^[A-Za-z0-9 ._-]+$/;

const panOsObjectNameSchema = (field: string) =>
  z
    .string({ required_error: `${field} is required` })
    .trim()
    .min(1, `${field} is required`)
    .max(63, `${field} cannot exceed 63 characters`)
    .regex(
      PAN_OS_OBJECT_NAME_REGEX,
      `${field} can only contain letters, numbers, spaces, periods, hyphens, and underscores`
    );

const PaloAltoNetworksSyncOptionsSchema = z.object({
  canRemoveCertificates: z.boolean().default(true),
  preserveItemOnRenewal: z.boolean().default(true),
  certificateNameSchema: z
    .string()
    .trim()
    .min(1, "Certificate name schema is required")
    .refine(
      (val) => {
        const allowedOptionalPlaceholders = [
          "{{profileId}}",
          "{{applicationId}}",
          "{{applicationName}}",
          "{{commonName}}"
        ];

        const allowedPlaceholdersRegexPart = [
          "{{certificateId}}",
          "{{shortCertificateId}}",
          ...allowedOptionalPlaceholders
        ]
          .map((p) => p.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"))
          .join("|");

        const allowedContentRegex = new RegExp(
          `^([a-zA-Z0-9_\\-]|${allowedPlaceholdersRegexPart})*$`
        );
        const contentIsValid = allowedContentRegex.test(val);

        const compiledLength = val
          .replace(/\{\{shortCertificateId\}\}/g, "0".repeat(22))
          .replace(/\{\{certificateId\}\}/g, "0".repeat(32))
          .replace(/\{\{profileId\}\}/g, "0".repeat(32))
          .replace(/\{\{applicationId\}\}/g, "0".repeat(32))
          .replace(/\{\{applicationName\}\}/g, "application-name")
          .replace(/\{\{commonName\}\}/g, "common-name").length;
        return contentIsValid && compiledLength <= 31;
      },
      {
        message:
          "Certificate name schema must be at most 31 characters once placeholders are filled in ({{shortCertificateId}} counts as 22). Outside placeholders, use only letters, numbers, hyphens (-), and underscores (_)."
      }
    )
});

const PaloAltoNetworksMultiCertificateSyncOptionsSchema = PaloAltoNetworksSyncOptionsSchema.extend({
  certificateNameSchema: PaloAltoNetworksSyncOptionsSchema.shape.certificateNameSchema.refine(
    (val) =>
      !/\{\{\w+\}\}/.test(val) || /\{\{(certificateId|shortCertificateId|commonName)\}\}/.test(val),
    {
      message:
        "Certificate name schema must include {{shortCertificateId}} or {{commonName}} so each certificate gets its own name, or use no placeholder for a single certificate."
    }
  )
});

const clearablePanOsObjectNameSchema = (field: string) =>
  z
    .union([z.literal(""), panOsObjectNameSchema(field)])
    .optional()
    .transform((value) => value || undefined);

const PaloAltoNetworksDestinationConfigSchema = z.object({
  template: clearablePanOsObjectNameSchema("Template"),
  pushToDevices: z.boolean().default(true)
});

const PaloAltoNetworksSslTlsProfileDestinationConfigSchema =
  PaloAltoNetworksDestinationConfigSchema.extend({
    sslTlsServiceProfileName: panOsObjectNameSchema("SSL/TLS service profile"),
    sslTlsServiceProfileVsys: clearablePanOsObjectNameSchema("Virtual system")
  });

const buildPaloAltoNetworksDestinationSchemas = <
  TDestination extends PkiSync,
  TConfig extends z.ZodTypeAny,
  TSyncOptions extends z.AnyZodObject
>(
  destination: TDestination,
  destinationConfig: TConfig,
  syncOptions: TSyncOptions
) => {
  const createSchema = BasePkiSyncSchema(syncOptions).merge(
    z.object({
      destination: z.literal(destination),
      destinationConfig
    })
  );

  const updateSchema = createSchema.partial().merge(
    z.object({
      name: z
        .string()
        .trim()
        .min(1, "Name is required")
        .max(255, "Name must be less than 255 characters"),
      destination: z.literal(destination),
      connection: z.object({
        id: z.string().uuid("Invalid connection ID format"),
        name: z
          .string()
          .min(1, "Connection name is required")
          .max(255, "Connection name must be less than 255 characters")
      })
    })
  );

  return { createSchema, updateSchema };
};

export const PaloAltoNetworksDestinationSchemas = buildPaloAltoNetworksDestinationSchemas(
  PkiSync.PaloAltoNetworks,
  PaloAltoNetworksDestinationConfigSchema,
  PaloAltoNetworksMultiCertificateSyncOptionsSchema
);

export const PaloAltoNetworksSslTlsProfileDestinationSchemas =
  buildPaloAltoNetworksDestinationSchemas(
    PkiSync.PaloAltoNetworksSslTlsProfile,
    PaloAltoNetworksSslTlsProfileDestinationConfigSchema,
    PaloAltoNetworksSyncOptionsSchema
  );

export const PALO_ALTO_NETWORKS_TEMPLATE_REQUIRED_MESSAGE =
  "Select the Panorama template to store the certificates in";

export const isPaloAltoNetworksTemplateMissing = (
  isPanorama: boolean | undefined,
  destinationConfig: unknown
) => Boolean(isPanorama) && !(destinationConfig as { template?: string } | undefined)?.template;
