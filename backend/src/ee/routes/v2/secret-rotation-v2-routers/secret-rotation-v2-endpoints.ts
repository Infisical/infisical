import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import { SECRET_ROTATION_NAME_MAP } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-maps";
import {
  TRotateAtUtc,
  TSecretRotationV2,
  TSecretRotationV2GeneratedCredentials,
  TSecretRotationV2Input
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { ApiDocsTags, SecretRotations } from "@app/lib/api-docs";
import { startsWithVowel } from "@app/lib/fn";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerSecretRotationEndpoints = <
  T extends TSecretRotationV2,
  I extends TSecretRotationV2Input,
  C extends TSecretRotationV2GeneratedCredentials
>({
  server,
  type,
  createSchema,
  updateSchema,
  responseSchema,
  generatedCredentialsSchema
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
    secretsMapping: I["secretsMapping"];
    description?: string | null;
    isAutoRotationEnabled?: boolean;
    rotationInterval: number;
    rotateAtUtc?: TRotateAtUtc;
  }>;
  updateSchema: z.ZodType<{
    connectionId?: string;
    name?: string;
    environment?: string;
    secretPath?: string;
    parameters?: I["parameters"];
    secretsMapping?: I["secretsMapping"];
    description?: string | null;
    isAutoRotationEnabled?: boolean;
    rotationInterval?: number;
    rotateAtUtc?: TRotateAtUtc;
  }>;
  responseSchema: z.ZodTypeAny;
  generatedCredentialsSchema: z.ZodTypeAny;
}) => {
  const rotationType = SECRET_ROTATION_NAME_MAP[type];
  const rotationTypeId = rotationType.replace(/\s+/g, "");

  server.route({
    method: "GET",
    url: `/`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: `list${rotationTypeId}Rotations`,
      tags: [ApiDocsTags.SecretRotations],
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

  server.route({
    method: "GET",
    url: "/:rotationId",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: `get${rotationTypeId}Rotation`,
      tags: [ApiDocsTags.SecretRotations],
      description: `Get the specified ${rotationType} Rotation by ID.`,
      params: z.object({
        rotationId: z.string().uuid().describe(SecretRotations.GET_BY_ID(type).rotationId)
      }),
      response: {
        200: z.object({ secretRotation: responseSchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { rotationId } = req.params;

      const secretRotation = (await server.services.secretRotationV2.findSecretRotationById(
        { rotationId, type },
        req.permission
      )) as T;

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: secretRotation.projectId,
        event: {
          type: EventType.GET_SECRET_ROTATION,
          metadata: {
            rotationId,
            type,
            secretPath: secretRotation.folder.path,
            environment: secretRotation.environment.slug
          }
        }
      });

      return { secretRotation };
    }
  });

  server.route({
    method: "GET",
    url: `/rotation-name/:rotationName`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: `get${rotationTypeId}RotationByName`,
      tags: [ApiDocsTags.SecretRotations],
      description: `Get the specified ${rotationType} Rotation by name, secret path, environment and project ID.`,
      params: z.object({
        rotationName: z
          .string()
          .trim()
          .min(1, "Rotation name required")
          .describe(SecretRotations.GET_BY_NAME(type).rotationName)
      }),
      querystring: z.object({
        projectId: z
          .string()
          .trim()
          .min(1, "Project ID required")
          .describe(SecretRotations.GET_BY_NAME(type).projectId),
        secretPath: z
          .string()
          .trim()
          .min(1, "Secret path required")
          .describe(SecretRotations.GET_BY_NAME(type).secretPath),
        environment: z
          .string()
          .trim()
          .min(1, "Environment required")
          .describe(SecretRotations.GET_BY_NAME(type).environment)
      }),
      response: {
        200: z.object({ secretRotation: responseSchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { rotationName } = req.params;
      const { projectId, secretPath, environment } = req.query;

      const secretRotation = (await server.services.secretRotationV2.findSecretRotationByName(
        { rotationName, projectId, type, secretPath, environment },
        req.permission
      )) as T;

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.GET_SECRET_ROTATION,
          metadata: {
            rotationId: secretRotation.id,
            type,
            secretPath,
            environment
          }
        }
      });

      return { secretRotation };
    }
  });

  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: `create${rotationTypeId}Rotation`,
      tags: [ApiDocsTags.SecretRotations],
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

  server.route({
    method: "PATCH",
    url: "/:rotationId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: `update${rotationTypeId}Rotation`,
      tags: [ApiDocsTags.SecretRotations],
      description: `Update the specified ${rotationType} Rotation.`,
      params: z.object({
        rotationId: z.string().uuid().describe(SecretRotations.UPDATE(type).rotationId)
      }),
      body: updateSchema,
      response: {
        200: z.object({ secretRotation: responseSchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { rotationId } = req.params;

      const secretRotation = (await server.services.secretRotationV2.updateSecretRotation(
        { ...req.body, rotationId, type },
        req.permission
      )) as T;

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: secretRotation.projectId,
        event: {
          type: EventType.UPDATE_SECRET_ROTATION,
          metadata: {
            rotationId,
            type,
            ...req.body
          }
        }
      });

      return { secretRotation };
    }
  });

  server.route({
    method: "DELETE",
    url: `/:rotationId`,
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: `delete${rotationTypeId}Rotation`,
      tags: [ApiDocsTags.SecretRotations],
      description: `Delete the specified ${rotationType} Rotation.`,
      params: z.object({
        rotationId: z.string().uuid().describe(SecretRotations.DELETE(type).rotationId)
      }),
      querystring: z.object({
        deleteSecrets: z
          .enum(["true", "false"])
          .optional()
          .transform((value) => value === "true")
          .describe(SecretRotations.DELETE(type).deleteSecrets),
        revokeGeneratedCredentials: z
          .enum(["true", "false"])
          .optional()
          .transform((value) => value === "true")
          .describe(SecretRotations.DELETE(type).revokeGeneratedCredentials)
      }),
      response: {
        200: z.object({ secretRotation: responseSchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { rotationId } = req.params;
      const { deleteSecrets, revokeGeneratedCredentials } = req.query;

      const secretRotation = (await server.services.secretRotationV2.deleteSecretRotation(
        { type, rotationId, deleteSecrets, revokeGeneratedCredentials },
        req.permission
      )) as T;

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: secretRotation.projectId,
        event: {
          type: EventType.DELETE_SECRET_ROTATION,
          metadata: {
            type,
            rotationId,
            deleteSecrets,
            revokeGeneratedCredentials
          }
        }
      });

      return { secretRotation };
    }
  });

  server.route({
    method: "GET",
    url: "/:rotationId/generated-credentials",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: `get${rotationTypeId}RotationGeneratedCredentials`,
      tags: [ApiDocsTags.SecretRotations],
      description: `Get the generated credentials for the specified ${rotationType} Rotation.`,
      params: z.object({
        rotationId: z.string().uuid().describe(SecretRotations.GET_GENERATED_CREDENTIALS_BY_ID(type).rotationId)
      }),
      response: {
        200: z.object({
          generatedCredentials: generatedCredentialsSchema,
          activeIndex: z.number(),
          rotationId: z.string().uuid(),
          type: z.literal(type)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { rotationId } = req.params;

      const {
        generatedCredentials,
        secretRotation: { activeIndex, projectId, folder, environment }
      } = await server.services.secretRotationV2.findSecretRotationGeneratedCredentialsById(
        {
          rotationId,
          type
        },
        req.permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.GET_SECRET_ROTATION_GENERATED_CREDENTIALS,
          metadata: {
            type,
            rotationId,
            secretPath: folder.path,
            environment: environment.slug
          }
        }
      });

      return { generatedCredentials: generatedCredentials as C, activeIndex, rotationId, type };
    }
  });

  server.route({
    method: "POST",
    url: "/:rotationId/rotate-secrets",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: `rotate${rotationTypeId}Rotation`,
      tags: [ApiDocsTags.SecretRotations],
      description: `Rotate the generated credentials for the specified ${rotationType} Rotation.`,
      params: z.object({
        rotationId: z.string().uuid().describe(SecretRotations.ROTATE(type).rotationId)
      }),
      response: {
        200: z.object({ secretRotation: responseSchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { rotationId } = req.params;

      const secretRotation = (await server.services.secretRotationV2.rotateSecretRotation(
        {
          rotationId,
          type,
          auditLogInfo: req.auditLogInfo
        },
        req.permission
      )) as T;

      return { secretRotation };
    }
  });
};
