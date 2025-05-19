import { z } from "zod";

import { SecretScanningDataSourcesSchema } from "@app/db/schemas";
import { SecretScanningDataSource } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";
import { SECRET_SCANNING_DATA_SOURCE_CONNECTION_MAP } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-maps";
import { SecretScanningDataSources } from "@app/lib/api-docs";
import { slugSchema } from "@app/server/lib/schemas";

type SecretScanningDataSourceSchemaOpts = {
  type: SecretScanningDataSource;
  isConnectionRequired: boolean;
};

// TODO: check if need type support for is connection required
export const BaseSecretScanningDataSourceSchema = ({
  type,
  isConnectionRequired
}: SecretScanningDataSourceSchemaOpts) =>
  SecretScanningDataSourcesSchema.omit({
    // unique to provider
    type: true,
    connectionId: true,
    config: true
  }).extend({
    type: z.literal(type),
    connectionId: isConnectionRequired ? z.string().uuid() : z.null(),
    connection: isConnectionRequired
      ? z.object({
          app: z.literal(SECRET_SCANNING_DATA_SOURCE_CONNECTION_MAP[type]),
          name: z.string(),
          id: z.string().uuid()
        })
      : z.null()
  });

export const BaseCreateSecretScanningDataSourceSchema = ({
  type,
  isConnectionRequired
}: SecretScanningDataSourceSchemaOpts) =>
  z.object({
    name: slugSchema({ field: "name" }).describe(SecretScanningDataSources.CREATE(type).name),
    projectId: z
      .string()
      .trim()
      .min(1, "Project ID required")
      .describe(SecretScanningDataSources.CREATE(type).projectId),
    description: z
      .string()
      .trim()
      .max(256, "Description cannot exceed 256 characters")
      .nullish()
      .describe(SecretScanningDataSources.CREATE(type).description),
    connectionId: isConnectionRequired
      ? z.string().uuid().describe(SecretScanningDataSources.CREATE(type).connectionId)
      : z.undefined(),
    isAutoScanEnabled: z
      .boolean()
      .optional()
      .default(true)
      .describe(SecretScanningDataSources.CREATE(type).isAutoScanEnabled)
  });

export const BaseUpdateSecretScanningDataSourceSchema = (type: SecretScanningDataSource) =>
  z.object({
    name: slugSchema({ field: "name" }).describe(SecretScanningDataSources.UPDATE(type).name).optional(),
    description: z
      .string()
      .trim()
      .max(256, "Description cannot exceed 256 characters")
      .nullish()
      .describe(SecretScanningDataSources.UPDATE(type).description),
    isAutoScanEnabled: z.boolean().optional().describe(SecretScanningDataSources.UPDATE(type).isAutoScanEnabled)
  });
