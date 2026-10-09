import { z } from "zod";

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
  template: PanOsObjectNameSchema("Template").optional(),
  pushToDevices: z.boolean().default(true)
});

export const PaloAltoNetworksSslTlsProfilePkiSyncConfigSchema = PaloAltoNetworksPkiSyncConfigSchema.extend({
  sslTlsServiceProfileName: PanOsObjectNameSchema("SSL/TLS service profile"),
  sslTlsServiceProfileVsys: PanOsObjectNameSchema("Virtual system").optional()
});

export const PaloAltoNetworksPkiSyncOptionsSchema = BasePkiSyncOptionsSchema.extend({
  certificateNameSchema: buildDestinationCertificateNameSchema({
    naming: PALO_ALTO_NETWORKS_NAMING,
    message:
      "Certificate name schema must result in names that contain only alphanumeric characters, hyphens (-), and underscores (_) and be 1-31 characters long for Palo Alto Networks. Use {{shortCertificateId}} rather than {{certificateId}} to stay within the limit. Available placeholders: {{certificateId}}, {{shortCertificateId}}, {{profileId}}, {{applicationId}}, {{applicationName}}, {{commonName}}. A schema with no placeholder can be linked to only one certificate."
  })
});

const buildPaloAltoNetworksPkiSyncSchemas = <TDestination extends PkiSync, TConfig extends z.AnyZodObject>(
  destination: TDestination,
  destinationConfig: TConfig
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
    syncOptions: PaloAltoNetworksPkiSyncOptionsSchema,
    subscriberId: z.string().uuid().nullish(),
    connectionId: z.string().uuid(),
    projectId: z.string().trim().min(1).optional().describe(openApiHidden()),
    applicationId: z.string().uuid().optional(),
    certificateIds: z.array(z.string().uuid()).optional(),
    filters: PkiSyncFiltersField
  }),
  updateSchema: z.object({
    name: z.string().trim().min(1).max(256).optional(),
    description: pkiDescriptionSchema.optional(),
    isAutoSyncEnabled: z.boolean().optional(),
    destinationConfig: destinationConfig.strict().optional(),
    syncOptions: PaloAltoNetworksPkiSyncOptionsSchema.optional(),
    subscriberId: z.string().uuid().nullish(),
    connectionId: z.string().uuid().optional(),
    filters: UpdatePkiSyncFiltersField
  })
});

export const PaloAltoNetworksPkiSyncSchemas = buildPaloAltoNetworksPkiSyncSchemas(
  PkiSync.PaloAltoNetworks,
  PaloAltoNetworksPkiSyncConfigSchema
);

export const PaloAltoNetworksSslTlsProfilePkiSyncSchemas = buildPaloAltoNetworksPkiSyncSchemas(
  PkiSync.PaloAltoNetworksSslTlsProfile,
  PaloAltoNetworksSslTlsProfilePkiSyncConfigSchema
);
