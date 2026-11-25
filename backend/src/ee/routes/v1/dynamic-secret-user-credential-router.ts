import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { DynamicSecretExternalUserIdSchema } from "@app/ee/services/dynamic-secret-user-credential/dynamic-secret-user-credential-types";
import { ApiDocsTags, DYNAMIC_SECRET_USER_CREDENTIALS } from "@app/lib/api-docs";
import { removeTrailingSlash } from "@app/lib/fn";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { SanitizedDynamicSecretUserCredentialSchema } from "@app/server/routes/sanitizedSchemas";
import { AuthMode } from "@app/services/auth/auth-type";

const MAX_TOKEN_LENGTH = 16_384;
const MAX_EXPIRES_IN_SECONDS = 10 * 365 * 24 * 60 * 60;

const DynamicSecretLocationSchema = z.object({
  projectSlug: z.string().trim().min(1).max(64).describe(DYNAMIC_SECRET_USER_CREDENTIALS.projectSlug),
  environmentSlug: z.string().trim().min(1).max(64).describe(DYNAMIC_SECRET_USER_CREDENTIALS.environmentSlug),
  path: z
    .string()
    .trim()
    .max(1024)
    .default("/")
    .transform(removeTrailingSlash)
    .describe(DYNAMIC_SECRET_USER_CREDENTIALS.path)
});

const DynamicSecretNameParamSchema = z.string().trim().min(1).max(64).describe(DYNAMIC_SECRET_USER_CREDENTIALS.name);
const ExternalUserIdParamSchema = DynamicSecretExternalUserIdSchema.describe(
  DYNAMIC_SECRET_USER_CREDENTIALS.externalUserId
);

export const registerDynamicSecretUserCredentialRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "PUT",
    url: "/:name/user-credentials/:externalUserId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: "upsertDynamicSecretUserCredential",
      tags: [ApiDocsTags.DynamicSecrets],
      description:
        "Store a user's OAuth 2.0 tokens on a dynamic secret that uses the authorization code grant, replacing any tokens already stored for that user.",
      params: z.object({
        name: DynamicSecretNameParamSchema,
        externalUserId: ExternalUserIdParamSchema
      }),
      body: DynamicSecretLocationSchema.extend({
        accessToken: z
          .string()
          .trim()
          .min(1)
          .max(MAX_TOKEN_LENGTH)
          .describe(DYNAMIC_SECRET_USER_CREDENTIALS.accessToken),
        refreshToken: z
          .string()
          .trim()
          .min(1)
          .max(MAX_TOKEN_LENGTH)
          .describe(DYNAMIC_SECRET_USER_CREDENTIALS.refreshToken),
        expiresInSeconds: z
          .number()
          .int()
          .min(1)
          .max(MAX_EXPIRES_IN_SECONDS)
          .optional()
          .describe(DYNAMIC_SECRET_USER_CREDENTIALS.expiresInSeconds),
        tokenType: z.string().trim().min(1).max(64).optional().describe(DYNAMIC_SECRET_USER_CREDENTIALS.tokenType),
        scope: z.string().trim().max(2048).optional().describe(DYNAMIC_SECRET_USER_CREDENTIALS.scope)
      }),
      response: {
        200: z.object({ userCredential: SanitizedDynamicSecretUserCredentialSchema }),
        201: z.object({ userCredential: SanitizedDynamicSecretUserCredentialSchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req, reply) => {
      const { userCredential, wasCreated, dynamicSecret, projectId, environment, secretPath } =
        await server.services.dynamicSecretUserCredential.upsertUserCredential({
          actor: req.permission.type,
          actorId: req.permission.id,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId,
          name: req.params.name,
          externalUserId: req.params.externalUserId,
          ...req.body
        });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.STORE_DYNAMIC_SECRET_USER_CREDENTIAL,
          metadata: {
            dynamicSecretName: dynamicSecret.name,
            dynamicSecretId: dynamicSecret.id,
            dynamicSecretType: dynamicSecret.type,
            userCredentialId: userCredential.id,
            externalUserId: userCredential.externalUserId,
            wasCreated,
            environment,
            secretPath,
            projectId
          }
        }
      });

      void reply.status(wasCreated ? 201 : 200);
      return { userCredential };
    }
  });

  server.route({
    method: "GET",
    url: "/:name/user-credentials",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: "listDynamicSecretUserCredentials",
      tags: [ApiDocsTags.DynamicSecrets],
      description: "List the users whose OAuth 2.0 tokens are stored on a dynamic secret. Tokens are never returned.",
      params: z.object({
        name: DynamicSecretNameParamSchema
      }),
      querystring: DynamicSecretLocationSchema.extend({
        offset: z.coerce.number().int().min(0).default(0).describe(DYNAMIC_SECRET_USER_CREDENTIALS.offset),
        limit: z.coerce.number().int().min(1).max(100).default(50).describe(DYNAMIC_SECRET_USER_CREDENTIALS.limit)
      }),
      response: {
        200: z.object({
          userCredentials: SanitizedDynamicSecretUserCredentialSchema.array(),
          totalCount: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const { userCredentials, totalCount, dynamicSecret, projectId, environment, secretPath } =
        await server.services.dynamicSecretUserCredential.listUserCredentials({
          actor: req.permission.type,
          actorId: req.permission.id,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId,
          name: req.params.name,
          ...req.query
        });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.LIST_DYNAMIC_SECRET_USER_CREDENTIALS,
          metadata: {
            dynamicSecretName: dynamicSecret.name,
            dynamicSecretId: dynamicSecret.id,
            dynamicSecretType: dynamicSecret.type,
            userCredentialCount: userCredentials.length,
            environment,
            secretPath,
            projectId
          }
        }
      });

      return { userCredentials, totalCount };
    }
  });

  server.route({
    method: "GET",
    url: "/:name/user-credentials/:externalUserId",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: "getDynamicSecretUserCredential",
      tags: [ApiDocsTags.DynamicSecrets],
      description:
        "Get the status of the OAuth 2.0 tokens stored for one user, such as whether the user has to authorize again. Tokens are never returned.",
      params: z.object({
        name: DynamicSecretNameParamSchema,
        externalUserId: ExternalUserIdParamSchema
      }),
      querystring: DynamicSecretLocationSchema,
      response: {
        200: z.object({ userCredential: SanitizedDynamicSecretUserCredentialSchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const { userCredential, dynamicSecret, projectId, environment, secretPath } =
        await server.services.dynamicSecretUserCredential.getUserCredential({
          actor: req.permission.type,
          actorId: req.permission.id,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId,
          name: req.params.name,
          externalUserId: req.params.externalUserId,
          ...req.query
        });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.GET_DYNAMIC_SECRET_USER_CREDENTIAL,
          metadata: {
            dynamicSecretName: dynamicSecret.name,
            dynamicSecretId: dynamicSecret.id,
            dynamicSecretType: dynamicSecret.type,
            userCredentialId: userCredential.id,
            externalUserId: userCredential.externalUserId,
            environment,
            secretPath,
            projectId
          }
        }
      });

      return { userCredential };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:name/user-credentials/:externalUserId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: "deleteDynamicSecretUserCredential",
      tags: [ApiDocsTags.DynamicSecrets],
      description:
        "Delete the OAuth 2.0 tokens stored for one user. Infisical first asks the authorization server to revoke the refresh token; the tokens are deleted even if that fails.",
      params: z.object({
        name: DynamicSecretNameParamSchema,
        externalUserId: ExternalUserIdParamSchema
      }),
      querystring: DynamicSecretLocationSchema,
      response: {
        200: z.object({
          userCredential: SanitizedDynamicSecretUserCredentialSchema,
          isRefreshTokenRevoked: z
            .boolean()
            .describe("Whether the authorization server confirmed it revoked the user's refresh token.")
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { userCredential, isRefreshTokenRevoked, dynamicSecret, projectId, environment, secretPath } =
        await server.services.dynamicSecretUserCredential.deleteUserCredential({
          actor: req.permission.type,
          actorId: req.permission.id,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId,
          name: req.params.name,
          externalUserId: req.params.externalUserId,
          ...req.query
        });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.DELETE_DYNAMIC_SECRET_USER_CREDENTIAL,
          metadata: {
            dynamicSecretName: dynamicSecret.name,
            dynamicSecretId: dynamicSecret.id,
            dynamicSecretType: dynamicSecret.type,
            userCredentialId: userCredential.id,
            externalUserId: userCredential.externalUserId,
            isRefreshTokenRevoked,
            environment,
            secretPath,
            projectId
          }
        }
      });

      return { userCredential, isRefreshTokenRevoked };
    }
  });
};
