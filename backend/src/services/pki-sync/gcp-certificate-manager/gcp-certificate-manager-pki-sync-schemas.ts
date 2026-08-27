import { z } from "zod";

import { openApiHidden } from "@app/server/lib/schemas";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { GCP_GLOBAL_LOCATION, GCP_PROJECT_ID_PATTERN } from "@app/services/app-connection/gcp/gcp-connection-constants";
import { pkiDescriptionSchema } from "@app/services/certificate-common/certificate-constants";
import { PkiSync } from "@app/services/pki-sync/pki-sync-enums";
import {
  BasePkiSyncOptionsSchema,
  buildDestinationCertificateNameSchema,
  PkiSyncSchema
} from "@app/services/pki-sync/pki-sync-schemas";

import {
  GCP_CERTIFICATE_MANAGER_NAMING,
  GCP_CERTIFICATE_MAP_NAME_PATTERN,
  GCP_HOSTNAME_PATTERN,
  GCP_LABEL_KEY_PATTERN,
  GCP_LABEL_VALUE_PATTERN,
  GCP_LOCATION_PATTERN,
  GCP_MAX_CERTIFICATES_PER_MAP_ENTRY,
  GCP_MAX_USER_LABELS,
  GCP_NAME_LEADING_LETTER_PATTERN,
  GCP_RESERVED_LABEL_KEYS
} from "./gcp-certificate-manager-pki-sync-constants";
import { GcpCertificateManagerScope } from "./gcp-certificate-manager-pki-sync-enums";

const GcpCertificateMapBindingSchema = z.object({
  certificateMap: z
    .string()
    .trim()
    .min(1, "Certificate map name is required")
    .max(63)
    .refine((value) => GCP_CERTIFICATE_MAP_NAME_PATTERN.test(value), {
      message: "Certificate map name must contain only lowercase letters, digits and hyphens (1-63 characters)"
    }),
  hostname: z
    .string()
    .trim()
    .max(253)
    .optional()
    .transform((value) => value || undefined)
    .refine((value) => value === undefined || GCP_HOSTNAME_PATTERN.test(value), {
      message: 'Hostname must be a fully qualified domain name or a wildcard expression such as "*.example.com"'
    })
});

const GcpCertificateManagerPkiSyncConfigFieldsSchema = z.object({
  gcpProjectId: z
    .string()
    .trim()
    .min(6)
    .max(30)
    .refine((value) => GCP_PROJECT_ID_PATTERN.test(value), {
      message:
        "GCP project ID must be 6-30 characters, start with a lowercase letter, contain only lowercase letters, digits and hyphens, and not end with a hyphen"
    }),
  location: z
    .string()
    .trim()
    .min(1, "Location is required")
    .refine((value) => GCP_LOCATION_PATTERN.test(value), {
      message: 'Location must be "global" or a GCP region ID such as "us-central1"'
    }),
  certificateMapBinding: GcpCertificateMapBindingSchema.optional()
});

const BaseGcpCertificateManagerPkiSyncConfigSchema = GcpCertificateManagerPkiSyncConfigFieldsSchema.extend({
  scope: z.nativeEnum(GcpCertificateManagerScope).default(GcpCertificateManagerScope.Default)
});

const UpdateGcpCertificateManagerPkiSyncConfigSchema = GcpCertificateManagerPkiSyncConfigFieldsSchema.extend({
  scope: z.nativeEnum(GcpCertificateManagerScope).optional()
});

const assertScopeCompatibility = (
  config: z.infer<typeof UpdateGcpCertificateManagerPkiSyncConfigSchema>,
  ctx: z.RefinementCtx
) => {
  if (config.certificateMapBinding && config.scope && config.scope !== GcpCertificateManagerScope.Default) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["certificateMapBinding"],
      message: `Certificate map binding requires the Default scope, but this sync uses "${config.scope}". A certificate map entry can only reference a Default-scope certificate.`
    });
  }

  if (config.location === GCP_GLOBAL_LOCATION) return;

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
      message: `Certificate map binding is only available for global certificates, but this sync targets "${config.location}". Regional Application Load Balancers attach certificates directly to the target HTTPS proxy, which Infisical does not manage.`
    });
  }
};

export const GcpCertificateManagerPkiSyncConfigSchema =
  BaseGcpCertificateManagerPkiSyncConfigSchema.superRefine(assertScopeCompatibility);

export const GcpCertificateManagerPkiSyncConfigUpdateSchema =
  UpdateGcpCertificateManagerPkiSyncConfigSchema.superRefine(assertScopeCompatibility);

const GcpLabelSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1, "Label key is required")
    .max(63)
    .refine((value) => GCP_LABEL_KEY_PATTERN.test(value), {
      message:
        "Label keys must start with a lowercase letter and contain only lowercase letters, digits, hyphens and underscores (up to 63 characters)"
    })
    .refine((value) => !(GCP_RESERVED_LABEL_KEYS as readonly string[]).includes(value), {
      message: `The label keys ${GCP_RESERVED_LABEL_KEYS.join(" and ")} are set by Infisical and cannot be overridden`
    }),
  value: z
    .string()
    .trim()
    .max(63)
    .refine((value) => GCP_LABEL_VALUE_PATTERN.test(value), {
      message:
        "Label values may contain only lowercase letters, digits, hyphens and underscores (up to 63 characters), and may be empty"
    })
});

export const GcpCertificateManagerPkiSyncOptionsSchema = BasePkiSyncOptionsSchema.omit({
  postSyncCommand: true
}).extend({
  canImportCertificates: z.literal(false).default(false),
  labels: GcpLabelSchema.array()
    .max(GCP_MAX_USER_LABELS, `At most ${GCP_MAX_USER_LABELS} labels can be set`)
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
  certificateNameSchema: buildDestinationCertificateNameSchema({
    naming: GCP_CERTIFICATE_MANAGER_NAMING,
    message:
      "Certificate name schema must include the {{certificateId}} or {{shortCertificateId}} placeholder and result in names that contain only lowercase letters, digits and hyphens and are 1-63 characters long for GCP Certificate Manager. Available placeholders: {{certificateId}}, {{shortCertificateId}}, {{profileId}}, {{applicationId}}, {{applicationName}}, {{commonName}}",
    requireCertificateIdentifier: true
  }).refine((value) => GCP_NAME_LEADING_LETTER_PATTERN.test(value), {
    message:
      'Certificate name schema must start with a lowercase letter, because GCP Certificate Manager requires a resource ID to start with a letter and a placeholder can resolve to a digit. Prefix the schema, for example "infisical-{{certificateId}}".'
  })
});

export const GcpCertificateManagerPkiSyncSchema = PkiSyncSchema.extend({
  destination: z.literal(PkiSync.GcpCertificateManager),
  destinationConfig: BaseGcpCertificateManagerPkiSyncConfigSchema,
  syncOptions: GcpCertificateManagerPkiSyncOptionsSchema
});

export const CreateGcpCertificateManagerPkiSyncSchema = z
  .object({
    name: z.string().trim().min(1).max(256),
    description: pkiDescriptionSchema.optional(),
    isAutoSyncEnabled: z.boolean().default(true),
    destinationConfig: GcpCertificateManagerPkiSyncConfigSchema,
    syncOptions: GcpCertificateManagerPkiSyncOptionsSchema,
    subscriberId: z.string().nullish(),
    connectionId: z.string().uuid(),
    projectId: z.string().trim().min(1).optional().describe(openApiHidden()),
    applicationId: z.string().uuid().optional(),
    certificateIds: z.array(z.string().uuid()).optional()
  })
  .superRefine((value, ctx) => {
    if (
      value.destinationConfig.certificateMapBinding &&
      (value.certificateIds?.length ?? 0) > GCP_MAX_CERTIFICATES_PER_MAP_ENTRY
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["destinationConfig", "certificateMapBinding"],
        message: `Certificate map binding supports up to ${GCP_MAX_CERTIFICATES_PER_MAP_ENTRY} certificates, which is the GCP limit for one certificate map entry.`
      });
    }
  });

export const UpdateGcpCertificateManagerPkiSyncSchema = z.object({
  name: z.string().trim().min(1).max(256).optional(),
  description: pkiDescriptionSchema.optional(),
  isAutoSyncEnabled: z.boolean().optional(),
  destinationConfig: GcpCertificateManagerPkiSyncConfigUpdateSchema.optional(),
  syncOptions: GcpCertificateManagerPkiSyncOptionsSchema.optional(),
  subscriberId: z.string().nullish(),
  connectionId: z.string().uuid().optional()
});

export const GcpCertificateManagerPkiSyncListItemSchema = z.object({
  name: z.literal("GCP Certificate Manager"),
  connection: z.literal(AppConnection.GCP),
  destination: z.literal(PkiSync.GcpCertificateManager),
  canImportCertificates: z.literal(false),
  canRemoveCertificates: z.literal(true)
});
