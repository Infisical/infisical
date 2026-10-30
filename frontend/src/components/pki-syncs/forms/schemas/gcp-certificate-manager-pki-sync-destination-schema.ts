import { z } from "zod";

import { GcpCertificateManagerScope, PkiSync } from "@app/hooks/api/pkiSyncs";
import { GCP_CERTIFICATE_MANAGER_GLOBAL_LOCATION } from "@app/hooks/api/pkiSyncs/types/gcp-certificate-manager-sync";

import { BasePkiSyncSchema } from "./base-pki-sync-schema";

const GCP_CERTIFICATE_NAME_ALLOWED_CONTENT =
  /^([a-z0-9-]|\{\{certificateId\}\}|\{\{shortCertificateId\}\}|\{\{profileId\}\}|\{\{applicationId\}\}|\{\{applicationName\}\}|\{\{commonName\}\})*$/;

const compileTestName = (schema: string) =>
  schema
    .replace(/\{\{shortCertificateId\}\}/g, "0".repeat(22))
    .replace(/\{\{(certificateId|profileId|applicationId)\}\}/g, "0".repeat(32))
    .replace(/\{\{applicationName\}\}/g, "application-name")
    .replace(/\{\{commonName\}\}/g, "common-name");

const GCP_RESERVED_LABEL_KEYS = ["managed-by", "infisical-certificate-id"];

const GCP_NAME_LEADING_LETTER = /^[a-z]/;

const GCP_MAX_NAME_LENGTH = 63;

const GcpLabelSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1, "Label key is required")
    .max(63)
    .regex(
      /^[a-z][a-z0-9_-]{0,62}$/,
      "Label keys must start with a lowercase letter and contain only lowercase letters, digits, hyphens and underscores"
    )
    .refine((value) => !GCP_RESERVED_LABEL_KEYS.includes(value), {
      message: "This label key is set by Infisical and cannot be overridden"
    }),
  value: z
    .string()
    .trim()
    .max(63)
    .regex(
      /^[a-z0-9_-]*$/,
      "Label values may contain only lowercase letters, digits, hyphens and underscores"
    )
});

const GcpCertificateManagerSyncOptionsSchema = z.object({
  canImportCertificates: z.literal(false).default(false),
  preserveItemOnRenewal: z.boolean().default(true),
  labels: GcpLabelSchema.array()
    .max(62, "At most 62 labels can be set")
    .optional()
    .superRefine((labels, ctx) => {
      if (!labels) return;
      const seen = new Set<string>();
      labels.forEach((label, index) => {
        if (seen.has(label.key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [index, "key"],
            message: `Duplicate label key "${label.key}"`
          });
        }
        seen.add(label.key);
      });
    }),
  certificateNameSchema: z
    .string()
    .trim()
    .min(1, "Certificate name schema is required")
    .refine(
      (value) => value.includes("{{certificateId}}") || value.includes("{{shortCertificateId}}"),
      {
        message:
          "Certificate name schema must include the {{certificateId}} or {{shortCertificateId}} placeholder so every certificate gets a unique name"
      }
    )
    .refine((value) => GCP_CERTIFICATE_NAME_ALLOWED_CONTENT.test(value), {
      message:
        "Certificate name schema may only contain lowercase letters, digits, hyphens and placeholders. GCP Certificate Manager does not allow uppercase letters, underscores or dots in a resource ID"
    })
    .refine((value) => GCP_NAME_LEADING_LETTER.test(value), {
      message:
        'Certificate name schema must start with a lowercase letter, because GCP Certificate Manager requires a resource ID to start with a letter and a placeholder can resolve to a digit. Prefix the schema, for example "infisical-{{certificateId}}"'
    })
    .refine((value) => compileTestName(value).length <= GCP_MAX_NAME_LENGTH, {
      message: `Certificate name schema must compile to at most ${GCP_MAX_NAME_LENGTH} characters for GCP Certificate Manager`
    })
});

const GcpCertificateManagerDestinationConfigSchema = z
  .object({
    gcpProjectId: z
      .string()
      .trim()
      .min(1, "GCP project is required")
      .max(30)
      .regex(
        /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/,
        "GCP project ID must be 6-30 characters of lowercase letters, digits and hyphens"
      ),
    location: z.string().trim().min(1, "Location is required"),
    scope: z.nativeEnum(GcpCertificateManagerScope).default(GcpCertificateManagerScope.Default),
    certificateMapBinding: z
      .object({
        certificateMap: z
          .string()
          .trim()
          .min(1, "Certificate map is required")
          .max(63)
          .regex(
            /^[a-z0-9-]{1,63}$/,
            "Certificate map name must contain only lowercase letters, digits and hyphens"
          ),
        hostname: z
          .string()
          .trim()
          .max(253)
          .optional()
          .transform((value) => value || undefined)
          .refine(
            (value) =>
              value === undefined ||
              /^(\*\.)?([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/.test(value),
            'Hostname must be a fully qualified domain name or a wildcard expression such as "*.example.com"'
          )
      })
      .optional()
  })
  .superRefine((config, ctx) => {
    if (config.certificateMapBinding && config.scope !== GcpCertificateManagerScope.Default) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["certificateMapBinding"],
        message:
          "Certificate map binding requires the Default scope. A certificate map entry can only reference a Default-scope certificate."
      });
    }

    if (config.location === GCP_CERTIFICATE_MANAGER_GLOBAL_LOCATION) return;

    if (config.scope === GcpCertificateManagerScope.AllRegions) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scope"],
        message: `The ALL_REGIONS scope is only available for global certificates, but this sync targets "${config.location}".`
      });
    }

    if (config.certificateMapBinding) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["certificateMapBinding"],
        message:
          "Certificate map binding is only available for global certificates. Regional Application Load Balancers attach certificates directly to the target HTTPS proxy."
      });
    }
  });

export const GcpCertificateManagerPkiSyncDestinationSchema = BasePkiSyncSchema(
  GcpCertificateManagerSyncOptionsSchema
).merge(
  z.object({
    destination: z.literal(PkiSync.GcpCertificateManager),
    destinationConfig: GcpCertificateManagerDestinationConfigSchema
  })
);

export const UpdateGcpCertificateManagerPkiSyncDestinationSchema =
  GcpCertificateManagerPkiSyncDestinationSchema.partial().merge(
    z.object({
      name: z
        .string()
        .trim()
        .min(1, "Name is required")
        .max(255, "Name must be less than 255 characters"),
      destination: z.literal(PkiSync.GcpCertificateManager),
      connection: z.object({
        id: z.string().uuid("Invalid connection ID format"),
        name: z
          .string()
          .min(1, "Connection name is required")
          .max(255, "Connection name must be less than 255 characters")
      })
    })
  );
