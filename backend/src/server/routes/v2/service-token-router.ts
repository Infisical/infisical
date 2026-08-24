import { z } from "zod";

import { ServiceTokensSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags } from "@app/lib/api-docs";
import { removeTrailingSlash } from "@app/lib/fn";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

import { sanitizedServiceTokenUserSchema } from "../sanitizedSchemas";

export const sanitizedServiceTokenSchema = ServiceTokensSchema.omit({
  secretHash: true,
  encryptedKey: true,
  iv: true,
  tag: true
});

export const registerServiceTokenRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.SERVICE_TOKEN]),
    schema: {
      hide: false,
      operationId: "getServiceToken",
      tags: [ApiDocsTags.ServiceTokens],
      description: "Return Infisical Token data",
      security: [
        {
          bearerAuth: []
        }
      ],
      response: {
        200: ServiceTokensSchema.merge(
          z.object({
            workspace: z.string(),
            user: sanitizedServiceTokenUserSchema.merge(
              z.object({
                _id: z.string(),
                __v: z.number().default(0)
              })
            ),
            _id: z.string(),
            __v: z.number().default(0)
          })
        )
      }
    },
    handler: async (req) => {
      const { serviceToken, user } = await server.services.serviceToken.getServiceToken({
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        actor: req.permission.type
      });

      const formattedUser = {
        ...user,
        _id: user.id,
        __v: 0
      } as const;

      const formattedServiceToken = {
        ...serviceToken,
        _id: serviceToken.id,
        __v: 0
      } as const;

      // We return the user here because older versions of the deprecated Python SDK depend on it to properly parse the API response.
      return { ...formattedServiceToken, workspace: serviceToken.projectId, user: formattedUser };
    }
  });

  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      operationId: "createServiceToken",
      body: z.object({
        name: z.string().trim(),
        workspaceId: z.string().trim(),
        scopes: z
          .object({
            environment: z.string().trim(),
            secretPath: z.string().trim().transform(removeTrailingSlash)
          })
          .array()
          .min(1),
        encryptedKey: z.string().trim(),
        iv: z.string().trim(),
        tag: z.string().trim(),
        expiresIn: z.number().nullable(),
        permissions: z.enum(["read", "write"]).array()
      }),
      response: {
        200: z.object({
          serviceToken: z.string(),
          serviceTokenData: sanitizedServiceTokenSchema
        })
      }
    },
    handler: async (req) => {
      const { serviceToken, token } = await server.services.serviceToken.createServiceToken({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body,
        projectId: req.body.workspaceId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: serviceToken.projectId,
        event: {
          type: EventType.CREATE_SERVICE_TOKEN,
          metadata: {
            name: serviceToken.name,
            scopes: req.body.scopes
          }
        }
      });
      return { serviceToken: token, serviceTokenData: serviceToken };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:serviceTokenId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      operationId: "deleteServiceToken",
      params: z.object({
        serviceTokenId: z.string().trim()
      }),
      response: {
        200: z.object({
          serviceTokenData: sanitizedServiceTokenSchema
        })
      }
    },
    handler: async (req) => {
      const serviceTokenData = await server.services.serviceToken.deleteServiceToken({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: req.params.serviceTokenId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: serviceTokenData.projectId,
        event: {
          type: EventType.DELETE_SERVICE_TOKEN,
          metadata: {
            name: serviceTokenData.name,
            scopes: serviceTokenData.scopes as Array<{ environment: string; secretPath: string }>
          }
        }
      });

      return { serviceTokenData };
    }
  });
};
