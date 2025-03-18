import { z } from "zod";

import { AppConnectionsSchema } from "@app/db/schemas/app-connections";
import { AppConnections } from "@app/lib/api-docs";
import { slugSchema } from "@app/server/lib/schemas";
import { APP_CONNECTION_NAME_MAP } from "@app/services/app-connection/app-connection-maps";
import { TAppConnectionBaseConfig } from "@app/services/app-connection/app-connection-types";

import { AppConnection } from "./app-connection-enums";

export const BaseAppConnectionSchema = AppConnectionsSchema.omit({
  encryptedCredentials: true,
  app: true,
  method: true
}).extend({
  credentialsHash: z.string().optional()
});

export const GenericCreateAppConnectionFieldsSchema = (
  app: AppConnection,
  { supportsPlatformManagement = false }: TAppConnectionBaseConfig = {}
) =>
  z.object({
    name: slugSchema({ field: "name" }).describe(AppConnections.CREATE(app).name),
    description: z
      .string()
      .trim()
      .max(256, "Description cannot exceed 256 characters")
      .nullish()
      .describe(AppConnections.CREATE(app).description),
    isPlatformManaged: supportsPlatformManagement
      ? z.boolean().optional().default(false).describe(AppConnections.CREATE(app).isPlatformManaged)
      : z.literal(false).optional().describe(`Not supported for ${APP_CONNECTION_NAME_MAP[app]} Connections.`)
  });

export const GenericUpdateAppConnectionFieldsSchema = (
  app: AppConnection,
  { supportsPlatformManagement = false }: TAppConnectionBaseConfig = {}
) =>
  z.object({
    name: slugSchema({ field: "name" }).describe(AppConnections.UPDATE(app).name).optional(),
    description: z
      .string()
      .trim()
      .max(256, "Description cannot exceed 256 characters")
      .nullish()
      .describe(AppConnections.UPDATE(app).description),
    isPlatformManaged: supportsPlatformManagement
      ? z.boolean().optional().describe(AppConnections.CREATE(app).isPlatformManaged)
      : z.literal(false).optional().describe(`Not supported for ${APP_CONNECTION_NAME_MAP[app]} Connections.`)
  });
