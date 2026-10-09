import RE2 from "re2";
import { z } from "zod";

import { PALO_ALTO_NETWORKS_PKI_SYNC_DESTINATION_CONFIG } from "@app/lib/api-docs";
import { openApiHidden } from "@app/server/lib/schemas";
import { PanOsObjectNameSchema } from "@app/services/app-connection/palo-alto-networks/palo-alto-networks-connection-schemas";
import { pkiDescriptionSchema } from "@app/services/certificate-common/certificate-constants";
import { PkiSync } from "@app/services/pki-sync/pki-sync-enums";
import {
  BasePkiSyncOptionsSchema,
  buildDestinationCertificateNameSchema,
  PkiSyncFiltersField,
  PkiSyncSchema,
  UpdatePkiSyncFiltersField
} from "@app/services/pki-sync/pki-sync-schemas";

import { PALO_ALTO_NETWORKS_NAMING } from "./palo-alto-networks-pki-sync-constants";

export const PaloAltoNetworksPkiSyncConfigSchema = z.object({
  template: PanOsObjectNameSchema("Template")
    .optional()
    .describe(PALO_ALTO_NETWORKS_PKI_SYNC_DESTINATION_CONFIG.template),
  pushToDevices: z.boolean().default(true).describe(PALO_ALTO_NETWORKS_PKI_SYNC_DESTINATION_CONFIG.pushToDevices)
});

export const PaloAltoNetworksSslTlsProfilePkiSyncConfigSchema = PaloAltoNetworksPkiSyncConfigSchema.extend({
  sslTlsServiceProfileName: PanOsObjectNameSchema("SSL/TLS service profile").describe(
    PALO_ALTO_NETWORKS_PKI_SYNC_DESTINATION_CONFIG.sslTlsServiceProfileName
  ),
  sslTlsServiceProfileVsys: PanOsObjectNameSchema("Virtual system")
    .optional()
    .describe(PALO_ALTO_NETWORKS_PKI_SYNC_DESTINATION_CONFIG.sslTlsServiceProfileVsys)
});

const ANY_NAME_PLACEHOLDER = new RE2("\\{\\{\\w+\\}\\}");
const CERTIFICATE_NAME_PLACEHOLDER = new RE2("\\{\\{(certificateId|shortCertificateId|commonName)\\}\\}");

export const PaloAltoNetworksPkiSyncOptionsSchema = BasePkiSyncOptionsSchema.extend({
  certificateNameSchema: buildDestinationCertificateNameSchema({
    naming: PALO_ALTO_NETWORKS_NAMING,
    message:
      "Certificate name schema must result in names that contain only alphanumeric characters, hyphens (-), and underscores (_) and be 1-31 characters long for Palo Alto Networks. Use {{shortCertificateId}} rather than {{certificateId}} to stay within the limit. Available placeholders: {{certificateId}}, {{shortCertificateId}}, {{profileId}}, {{applicationId}}, {{applicationName}}, {{commonName}}. A schema with no placeholder can be linked to only one certificate."
  })
});

const PaloAltoNetworksMultiCertificatePkiSyncOptionsSchema = PaloAltoNetworksPkiSyncOptionsSchema.refine(
  ({ certificateNameSchema }) =>
    !certificateNameSchema ||
    !ANY_NAME_PLACEHOLDER.test(certificateNameSchema) ||
    CERTIFICATE_NAME_PLACEHOLDER.test(certificateNameSchema),
  {
    message:
      "Certificate name schema must include {{shortCertificateId}} or {{commonName}} so each certificate gets its own name, or use no placeholder for a single certificate.",
    path: ["certificateNameSchema"]
  }
);

const buildPaloAltoNetworksPkiSyncSchemas = <
  TDestination extends PkiSync,
  TConfig extends z.AnyZodObject,
  TInputOptions extends z.ZodTypeAny
>(
  destination: TDestination,
  destinationConfig: TConfig,
  inputSyncOptions: TInputOptions
) => ({
  responseSchema: PkiSyncSchema.extend({
    destination: z.literal(destination),
    destinationConfig,
    syncOptions: PaloAltoNetworksPkiSyncOptionsSchema
  }),
  createSchema: z.object({
    name: z.string().trim().min(1).max(256),
    description: pkiDescriptionSchema.optional(),
    isAutoSyncEnabled: z.boolean().default(true),
    destinationConfig: destinationConfig.strict(),
    syncOptions: inputSyncOptions,
    subscriberId: z.string().uuid().nullish(),
    connectionId: z.string().uuid(),
    projectId: z.string().trim().uuid().optional().describe(openApiHidden()),
    applicationId: z.string().uuid().optional(),
    certificateIds: z.array(z.string().uuid()).optional(),
    filters: PkiSyncFiltersField
  }),
  updateSchema: z.object({
    name: z.string().trim().min(1).max(256).optional(),
    description: pkiDescriptionSchema.optional(),
    isAutoSyncEnabled: z.boolean().optional(),
    destinationConfig: destinationConfig.strict().optional(),
    syncOptions: inputSyncOptions.optional(),
    subscriberId: z.string().uuid().nullish(),
    connectionId: z.string().uuid().optional(),
    filters: UpdatePkiSyncFiltersField
  })
});

export const PaloAltoNetworksPkiSyncSchemas = buildPaloAltoNetworksPkiSyncSchemas(
  PkiSync.PaloAltoNetworks,
  PaloAltoNetworksPkiSyncConfigSchema,
  PaloAltoNetworksMultiCertificatePkiSyncOptionsSchema
);

export const PaloAltoNetworksSslTlsProfilePkiSyncSchemas = buildPaloAltoNetworksPkiSyncSchemas(
  PkiSync.PaloAltoNetworksSslTlsProfile,
  PaloAltoNetworksSslTlsProfilePkiSyncConfigSchema,
  PaloAltoNetworksPkiSyncOptionsSchema
);
