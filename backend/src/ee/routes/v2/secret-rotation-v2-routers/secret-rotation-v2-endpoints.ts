import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import { SECRET_ROTATION_NAME_MAP } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-maps";
import {
  TSecretRotationV2,
  TSecretRotationV2Input
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { SecretRotations } from "@app/lib/api-docs";
import { startsWithVowel } from "@app/lib/fn";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerSecretRotationEndpoints = <T extends TSecretRotationV2, I extends TSecretRotationV2Input>({
  server,
  type,
  createSchema,
  updateSchema,
  responseSchema
}: {
  type: SecretRotation;
  server: FastifyZodProvider;
  createSchema: z.ZodType<{
    name: string;
    environment: string;
    secretPath: string;
    projectId: string;
    connectionId: string;
    parameters: I["parameters"];
    description?: string | null;
    isAutoRotationEnabled?: boolean;
    interval: number;
  }>;
  updateSchema: z.ZodType<{
    connectionId?: string;
    name?: string;
    environment?: string;
    secretPath?: string;
    parameters?: I["parameters"];
    description?: string | null;
    isAutoRotationEnabled?: boolean;
    interval?: number;
  }>;
  responseSchema: z.ZodTypeAny;
}) => {
  const rotationType = SECRET_ROTATION_NAME_MAP[type];

  server.route({
    method: "GET",
    url: `/`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: `List the ${rotationType} Rotations for the specified project.`,
      querystring: z.object({
        projectId: z.string().trim().min(1, "Project ID required").describe(SecretRotations.LIST(type).projectId)
      }),
      response: {
        200: z.object({ secretRotations: responseSchema.array() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const {
        query: { projectId }
      } = req;

      const secretRotations = (await server.services.secretRotationV2.listSecretRotationsByProjectId(
        { projectId, type },
        req.permission
      )) as T[];

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.GET_SECRET_ROTATIONS,
          metadata: {
            type,
            count: secretRotations.length,
            rotationIds: secretRotations.map((rotation) => rotation.id)
          }
        }
      });

      return { secretRotations };
    }
  });

  // server.route({
  //   method: "GET",
  //   url: "/:syncId",
  //   config: {
  //     rateLimit: readLimit
  //   },
  //   schema: {
  //     description: `Get the specified ${rotationType} Rotation by ID.`,
  //     params: z.object({
  //       syncId: z.string().uuid().describe(SecretRotations.GET_BY_ID(destination).syncId)
  //     }),
  //     response: {
  //       200: z.object({ secretRotation: responseSchema })
  //     }
  //   },
  //   onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
  //   handler: async (req) => {
  //     const { syncId } = req.params;
  //
  //     const secretRotation = (await server.services.secretRotation.findSecretRotationById(
  //       { syncId, destination },
  //       req.permission
  //     )) as T;
  //
  //     await server.services.auditLog.createAuditLog({
  //       ...req.auditLogInfo,
  //       projectId: secretRotation.projectId,
  //       event: {
  //         type: EventType.GET_SECRET_SYNC,
  //         metadata: {
  //           syncId,
  //           destination
  //         }
  //       }
  //     });
  //
  //     return { secretRotation };
  //   }
  // });
  //
  // server.route({
  //   method: "GET",
  //   url: `/sync-name/:syncName`,
  //   config: {
  //     rateLimit: readLimit
  //   },
  //   schema: {
  //     description: `Get the specified ${rotationType} Rotation by name and project ID.`,
  //     params: z.object({
  //       syncName: z
  //         .string()
  //         .trim()
  //         .min(1, "Rotation name required")
  //         .describe(SecretRotations.GET_BY_NAME(destination).syncName)
  //     }),
  //     querystring: z.object({
  //       projectId: z
  //         .string()
  //         .trim()
  //         .min(1, "Project ID required")
  //         .describe(SecretRotations.GET_BY_NAME(destination).projectId)
  //     }),
  //     response: {
  //       200: z.object({ secretRotation: responseSchema })
  //     }
  //   },
  //   onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
  //   handler: async (req) => {
  //     const { syncName } = req.params;
  //     const { projectId } = req.query;
  //
  //     const secretRotation = (await server.services.secretRotation.findSecretRotationByName(
  //       { syncName, projectId, destination },
  //       req.permission
  //     )) as T;
  //
  //     await server.services.auditLog.createAuditLog({
  //       ...req.auditLogInfo,
  //       projectId,
  //       event: {
  //         type: EventType.GET_SECRET_SYNC,
  //         metadata: {
  //           syncId: secretRotation.id,
  //           destination
  //         }
  //       }
  //     });
  //
  //     return { secretRotation };
  //   }
  // });

  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: `Create ${
        startsWithVowel(rotationType) ? "an" : "a"
      } ${rotationType} Rotation for the specified project.`,
      body: createSchema,
      response: {
        200: z.object({ secretRotation: responseSchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const secretRotation = (await server.services.secretRotationV2.createSecretRotation(
        { ...req.body, type },
        req.permission
      )) as T;

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: secretRotation.projectId,
        event: {
          type: EventType.CREATE_SECRET_ROTATION,
          metadata: {
            rotationId: secretRotation.id,
            type,
            ...req.body
          }
        }
      });

      return { secretRotation };
    }
  });

  // server.route({
  //   method: "PATCH",
  //   url: "/:syncId",
  //   config: {
  //     rateLimit: writeLimit
  //   },
  //   schema: {
  //     description: `Update the specified ${rotationType} Rotation.`,
  //     params: z.object({
  //       syncId: z.string().uuid().describe(SecretRotations.UPDATE(destination).syncId)
  //     }),
  //     body: updateSchema,
  //     response: {
  //       200: z.object({ secretRotation: responseSchema })
  //     }
  //   },
  //   onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
  //   handler: async (req) => {
  //     const { syncId } = req.params;
  //
  //     const secretRotation = (await server.services.secretRotation.updateSecretRotation(
  //       { ...req.body, syncId, destination },
  //       req.permission
  //     )) as T;
  //
  //     await server.services.auditLog.createAuditLog({
  //       ...req.auditLogInfo,
  //       projectId: secretRotation.projectId,
  //       event: {
  //         type: EventType.UPDATE_SECRET_SYNC,
  //         metadata: {
  //           syncId,
  //           destination,
  //           ...req.body
  //         }
  //       }
  //     });
  //
  //     return { secretRotation };
  //   }
  // });
  //
  // server.route({
  //   method: "DELETE",
  //   url: `/:syncId`,
  //   config: {
  //     rateLimit: writeLimit
  //   },
  //   schema: {
  //     description: `Delete the specified ${rotationType} Rotation.`,
  //     params: z.object({
  //       syncId: z.string().uuid().describe(SecretRotations.DELETE(destination).syncId)
  //     }),
  //     querystring: z.object({
  //       removeSecrets: z
  //         .enum(["true", "false"])
  //         .default("false")
  //         .transform((value) => value === "true")
  //         .describe(SecretRotations.DELETE(destination).removeSecrets)
  //     }),
  //     response: {
  //       200: z.object({ secretRotation: responseSchema })
  //     }
  //   },
  //   onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
  //   handler: async (req) => {
  //     const { syncId } = req.params;
  //     const { removeSecrets } = req.query;
  //
  //     const secretRotation = (await server.services.secretRotation.deleteSecretRotation(
  //       { destination, syncId, removeSecrets },
  //       req.permission
  //     )) as T;
  //
  //     await server.services.auditLog.createAuditLog({
  //       ...req.auditLogInfo,
  //       orgId: req.permission.orgId,
  //       event: {
  //         type: EventType.DELETE_SECRET_SYNC,
  //         metadata: {
  //           destination,
  //           syncId,
  //           removeSecrets
  //         }
  //       }
  //     });
  //
  //     return { secretRotation };
  //   }
  // });
  //
  // server.route({
  //   method: "POST",
  //   url: "/:syncId/sync-secrets",
  //   config: {
  //     rateLimit: writeLimit
  //   },
  //   schema: {
  //     description: `Trigger a sync for the specified ${rotationType} Rotation.`,
  //     params: z.object({
  //       syncId: z.string().uuid().describe(SecretRotations.SYNC_SECRETS(destination).syncId)
  //     }),
  //     response: {
  //       200: z.object({ secretRotation: responseSchema })
  //     }
  //   },
  //   onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
  //   handler: async (req) => {
  //     const { syncId } = req.params;
  //
  //     const secretRotation = (await server.services.secretRotation.triggerSecretRotationRotationSecretsById(
  //       {
  //         syncId,
  //         destination,
  //         auditLogInfo: req.auditLogInfo
  //       },
  //       req.permission
  //     )) as T;
  //
  //     return { secretRotation };
  //   }
  // });
  //
  // server.route({
  //   method: "POST",
  //   url: "/:syncId/import-secrets",
  //   config: {
  //     rateLimit: writeLimit
  //   },
  //   schema: {
  //     description: `Import secrets from the specified ${rotationType} Rotation destination.`,
  //     params: z.object({
  //       syncId: z.string().uuid().describe(SecretRotations.IMPORT_SECRETS(destination).syncId)
  //     }),
  //     querystring: z.object({
  //       importBehavior: z
  //         .nativeEnum(SecretRotationImportBehavior)
  //         .describe(SecretRotations.IMPORT_SECRETS(destination).importBehavior)
  //     }),
  //     response: {
  //       200: z.object({ secretRotation: responseSchema })
  //     }
  //   },
  //   onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
  //   handler: async (req) => {
  //     const { syncId } = req.params;
  //     const { importBehavior } = req.query;
  //
  //     const secretRotation = (await server.services.secretRotation.triggerSecretRotationImportSecretsById(
  //       {
  //         syncId,
  //         destination,
  //         importBehavior
  //       },
  //       req.permission
  //     )) as T;
  //
  //     return { secretRotation };
  //   }
  // });
  //
  // server.route({
  //   method: "POST",
  //   url: "/:syncId/remove-secrets",
  //   config: {
  //     rateLimit: writeLimit
  //   },
  //   schema: {
  //     description: `Remove previously synced secrets from the specified ${rotationType} Rotation destination.`,
  //     params: z.object({
  //       syncId: z.string().uuid().describe(SecretRotations.REMOVE_SECRETS(destination).syncId)
  //     }),
  //     response: {
  //       200: z.object({ secretRotation: responseSchema })
  //     }
  //   },
  //   onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
  //   handler: async (req) => {
  //     const { syncId } = req.params;
  //
  //     const secretRotation = (await server.services.secretRotation.triggerSecretRotationRemoveSecretsById(
  //       {
  //         syncId,
  //         destination
  //       },
  //       req.permission
  //     )) as T;
  //
  //     return { secretRotation };
  //   }
  // });
};
