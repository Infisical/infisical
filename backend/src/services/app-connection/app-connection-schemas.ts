import { z } from "zod";

import { AppConnectionsSchema } from "@app/db/schemas/app-connections";
import { AppConnections } from "@app/lib/api-docs";
import { slugSchema } from "@app/server/lib/schemas";
import { APP_CONNECTION_NAME_MAP } from "@app/services/app-connection/app-connection-maps";
import { TAppConnectionBaseConfig } from "@app/services/app-connection/app-connection-types";

import { AppConnection } from "./app-connection-enums";
import { AppConnectionCredentialRotationStatus } from "./credential-rotation/app-connection-credential-rotation-enums";
import {
  CreateAppConnectionCredentialRotationSchema,
  UpdateAppConnectionCredentialRotationSchema
} from "./credential-rotation/app-connection-credential-rotation-schemas";

export const BaseAppConnectionSchema = AppConnectionsSchema.omit({
  encryptedCredentials: true,
  app: true,
  method: true
}).extend({
  rotation: z
    .object({
      lastRotationMessage: z.string().optional().nullable().describe("The message from the last rotation attempt."),
      rotationInterval: z.number().describe("The interval in days between credential rotations."),
      nextRotationAt: z.date().nullable().optional().describe("The next scheduled rotation time."),
      rotationStatus: z
        .nativeEnum(AppConnectionCredentialRotationStatus)
        .describe("The status of the last rotation attempt."),
      rotateAtUtc: z
        .object({
          hours: z.number().describe("The hour (0-23) at which to rotate."),
          minutes: z.number().describe("The minute (0-59) at which to rotate.")
        })
        .describe("The UTC time of day at which rotation should occur.")
    })
    .optional()
    .describe("The credential rotation configuration, if configured."),

  credentialsHash: z.string().optional(),
  project: z
    .object({
      name: z.string(),
      id: z.string(),
      type: z.string(),
      slug: z.string()
    })
    .nullish()
});

export const GenericCreateAppConnectionFieldsSchema = (
  app: AppConnection,
  {
    supportsPlatformManagedCredentials = false,
    supportsGateways = false,
    supportsCredentialRotation = false
  }: TAppConnectionBaseConfig = {}
) =>
  z
    .object({
      name: slugSchema({ field: "name" }).describe(AppConnections.CREATE(app).name),
      description: z
        .string()
        .trim()
        .max(256, "Description cannot exceed 256 characters")
        .nullish()
        .describe(AppConnections.CREATE(app).description),
      projectId: z.string().optional().describe(AppConnections.CREATE(app).projectId),
      isPlatformManagedCredentials: supportsPlatformManagedCredentials
        ? z.boolean().optional().default(false).describe(AppConnections.CREATE(app).isPlatformManagedCredentials)
        : z
            .literal(false, {
              errorMap: () => ({ message: `Not supported for ${APP_CONNECTION_NAME_MAP[app]} Connections` })
            })
            .optional()
            .describe(`Not supported for ${APP_CONNECTION_NAME_MAP[app]} Connections.`),
      gatewayId: supportsGateways
        ? z.string().uuid().nullish().describe("The Gateway ID to use for this connection.")
        : z
            .undefined({ message: `Not supported for ${APP_CONNECTION_NAME_MAP[app]} Connections` })
            .or(z.null({ message: `Not supported for ${APP_CONNECTION_NAME_MAP[app]} Connections` }))
            .describe(`Not supported for ${APP_CONNECTION_NAME_MAP[app]} Connections.`),

      isAutoRotationEnabled: supportsCredentialRotation
        ? z.boolean().optional().describe(AppConnections.CREATE(app).isAutoRotationEnabled)
        : z
            .literal(false, {
              errorMap: () => ({ message: `Not supported for ${APP_CONNECTION_NAME_MAP[app]} Connections` })
            })
            .optional()
            .describe(`Not supported for ${APP_CONNECTION_NAME_MAP[app]} Connections.`),

      rotation: supportsCredentialRotation
        ? CreateAppConnectionCredentialRotationSchema.optional().describe(AppConnections.CREATE(app).rotation)
        : z
            .undefined({ message: `Not supported for ${APP_CONNECTION_NAME_MAP[app]} Connections` })
            .or(z.null({ message: `Not supported for ${APP_CONNECTION_NAME_MAP[app]} Connections` }))
            .describe(`Not supported for ${APP_CONNECTION_NAME_MAP[app]} Connections.`)
    })
    .superRefine((data, ctx) => {
      if (data.isAutoRotationEnabled && !data.rotation) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Rotation details is required when auto rotation is enabled",
          path: ["rotation"]
        });
      }
    });

export const GenericUpdateAppConnectionFieldsSchema = (
  app: AppConnection,
  {
    supportsPlatformManagedCredentials = false,
    supportsGateways = false,
    supportsCredentialRotation = false
  }: TAppConnectionBaseConfig = {}
) =>
  z.object({
    name: slugSchema({ field: "name" }).describe(AppConnections.UPDATE(app).name).optional(),
    description: z
      .string()
      .trim()
      .max(256, "Description cannot exceed 256 characters")
      .nullish()
      .describe(AppConnections.UPDATE(app).description),
    isPlatformManagedCredentials: supportsPlatformManagedCredentials
      ? z.boolean().optional().describe(AppConnections.UPDATE(app).isPlatformManagedCredentials)
      : z
          .literal(false, {
            errorMap: () => ({ message: `Not supported for ${APP_CONNECTION_NAME_MAP[app]} Connections` })
          })
          .optional()
          .describe(`Not supported for ${APP_CONNECTION_NAME_MAP[app]} Connections.`),
    gatewayId: supportsGateways
      ? z.string().uuid().nullish().describe("The Gateway ID to use for this connection.")
      : z
          .undefined({ message: `Not supported for ${APP_CONNECTION_NAME_MAP[app]} Connections` })
          .or(z.null({ message: `Not supported for ${APP_CONNECTION_NAME_MAP[app]} Connections` }))
          .describe(`Not supported for ${APP_CONNECTION_NAME_MAP[app]} Connections.`),

    isAutoRotationEnabled: supportsCredentialRotation
      ? z.boolean().optional().describe(AppConnections.UPDATE(app).isAutoRotationEnabled)
      : z
          .literal(false, {
            errorMap: () => ({ message: `Not supported for ${APP_CONNECTION_NAME_MAP[app]} Connections` })
          })
          .optional()
          .describe(`Not supported for ${APP_CONNECTION_NAME_MAP[app]} Connections.`),

    rotation: supportsCredentialRotation
      ? UpdateAppConnectionCredentialRotationSchema.optional().describe(AppConnections.UPDATE(app).rotation)
      : z
          .undefined({ message: `Not supported for ${APP_CONNECTION_NAME_MAP[app]} Connections` })
          .or(z.null({ message: `Not supported for ${APP_CONNECTION_NAME_MAP[app]} Connections` }))
          .describe(`Not supported for ${APP_CONNECTION_NAME_MAP[app]} Connections.`)
  });
