import z from "zod";

import { KmipServersSchema } from "@app/db/schemas";
import { EventType, UserAgentType } from "@app/ee/services/audit-log/audit-log-types";
import { validateAccountIds, validatePrincipalArns } from "@app/ee/services/resource-auth-method/aws-auth-validators";
import { ResourceAuthMethodType } from "@app/ee/services/resource-auth-method/resource-auth-method-fns";
import { UnauthorizedError } from "@app/lib/errors";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { ActorType, AuthMode } from "@app/services/auth/auth-type";

const loginRateLimit = { windowMs: 60 * 1000, max: 10 };

const SanitizedKmipServerSchema = KmipServersSchema.pick({
  id: true,
  name: true,
  createdAt: true,
  updatedAt: true,
  heartbeat: true
}).extend({
  canRevoke: z.boolean()
});

const AwsAuthMethodConfigSchema = z.object({
  id: z.string().uuid(),
  stsEndpoint: z.string(),
  allowedPrincipalArns: z.string(),
  allowedAccountIds: z.string(),
  createdAt: z.date(),
  updatedAt: z.date()
});

const TokenAuthMethodConfigSchema = z.object({});

const IdentityAuthMethodConfigSchema = z.object({
  identityId: z.string(),
  identityName: z.string().nullable()
});

const AuthMethodViewSchema = z.discriminatedUnion("method", [
  z.object({ method: z.literal(ResourceAuthMethodType.Aws), config: AwsAuthMethodConfigSchema }),
  z.object({ method: z.literal(ResourceAuthMethodType.Token), config: TokenAuthMethodConfigSchema }),
  z.object({ method: z.literal(ResourceAuthMethodType.Identity), config: IdentityAuthMethodConfigSchema })
]);

const KmipServerWithAuthMethodSchema = SanitizedKmipServerSchema.extend({
  authMethod: AuthMethodViewSchema
});

const AwsAuthMethodInputSchema = z
  .object({
    method: z.literal(ResourceAuthMethodType.Aws),
    stsEndpoint: z.string().trim().min(1).default("https://sts.amazonaws.com/"),
    allowedPrincipalArns: validatePrincipalArns,
    allowedAccountIds: validateAccountIds
  })
  .refine((data) => data.allowedPrincipalArns.trim().length > 0 || data.allowedAccountIds.trim().length > 0, {
    message: "At least one of allowedPrincipalArns or allowedAccountIds must be set",
    path: ["allowedPrincipalArns"]
  });

const TokenAuthMethodInputSchema = z.object({
  method: z.literal(ResourceAuthMethodType.Token)
});

const SettableAuthMethodInputSchema = z.union([AwsAuthMethodInputSchema, TokenAuthMethodInputSchema]);

export const registerKmipServerRouter = async (server: FastifyZodProvider) => {
  // ─── POST / (Create KMIP server) ──────────────────────────────────────────
  server.route({
    method: "POST",
    url: "/",
    config: { rateLimit: writeLimit },
    schema: {
      description: "Create a new KMIP server with an initial auth method.",
      body: z.object({
        name: slugSchema({ min: 1, max: 32, field: "name" }),
        authMethod: SettableAuthMethodInputSchema
      }),
      response: {
        200: KmipServerWithAuthMethodSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { authMethod: authMethodInput, name } = req.body;
      const authMethodArg =
        authMethodInput.method === ResourceAuthMethodType.Aws
          ? {
              method: "aws" as const,
              config: {
                stsEndpoint: authMethodInput.stsEndpoint,
                allowedPrincipalArns: authMethodInput.allowedPrincipalArns,
                allowedAccountIds: authMethodInput.allowedAccountIds
              }
            }
          : { method: "token" as const };

      const kmipServer = await server.services.kmipServer.createKmipServer({
        name,
        authMethod: authMethodArg,
        actor: {
          type: req.permission.type,
          id: req.permission.id,
          orgId: req.permission.orgId,
          authMethod: req.permission.authMethod
        }
      });

      const view = await server.services.resourceAuthMethod.loadView({ type: "kmip", id: kmipServer.id });
      if (!view) throw new UnauthorizedError({ message: "Auth method missing after create" });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.KMIP_SERVER_CREATE,
          metadata: { kmipServerId: kmipServer.id, name: kmipServer.name }
        }
      });

      const canRevoke = await server.services.resourceAuthMethod.canRevoke(kmipServer, "kmip");

      return { ...kmipServer, canRevoke, authMethod: view };
    }
  });

  // ─── GET /:kmipServerId ───────────────────────────────────────────────────
  server.route({
    method: "GET",
    url: "/:kmipServerId",
    config: { rateLimit: readLimit },
    schema: {
      params: z.object({ kmipServerId: z.string().uuid() }),
      response: {
        200: KmipServerWithAuthMethodSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const kmipServer = await server.services.kmipServer.getOrgKmipServer({
        kmipServerId: req.params.kmipServerId,
        orgId: req.permission.orgId
      });

      const view = await server.services.resourceAuthMethod.getByKmipServerId({
        resource: { type: "kmip", id: req.params.kmipServerId },
        actor: req.permission
      });

      const canRevoke = await server.services.resourceAuthMethod.canRevoke(kmipServer, "kmip");

      return { ...kmipServer, canRevoke, authMethod: view };
    }
  });

  // ─── GET / (List KMIP servers) ────────────────────────────────────────────
  server.route({
    method: "GET",
    url: "/",
    config: { rateLimit: readLimit },
    schema: {
      response: {
        200: z.array(SanitizedKmipServerSchema.omit({ canRevoke: true }))
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      return server.services.kmipServer.listKmipServers({ actor: req.permission });
    }
  });

  // ─── PATCH /:kmipServerId ─────────────────────────────────────────────────
  server.route({
    method: "PATCH",
    url: "/:kmipServerId",
    config: { rateLimit: writeLimit },
    schema: {
      params: z.object({ kmipServerId: z.string().uuid() }),
      body: z.object({
        authMethod: SettableAuthMethodInputSchema.optional()
      }),
      response: {
        200: KmipServerWithAuthMethodSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const kmipServer = await server.services.kmipServer.getOrgKmipServer({
        kmipServerId: req.params.kmipServerId,
        orgId: req.permission.orgId
      });

      if (req.body.authMethod) {
        const authMethodInput = req.body.authMethod;
        const authMethodArg =
          authMethodInput.method === ResourceAuthMethodType.Aws
            ? {
                method: "aws" as const,
                stsEndpoint: authMethodInput.stsEndpoint,
                allowedPrincipalArns: authMethodInput.allowedPrincipalArns,
                allowedAccountIds: authMethodInput.allowedAccountIds
              }
            : { method: "token" as const };

        const view = await server.services.resourceAuthMethod.setMethod({
          resource: { type: "kmip", id: req.params.kmipServerId },
          authMethod: authMethodArg,
          actor: req.permission
        });

        await server.services.auditLog.createAuditLog({
          ...req.auditLogInfo,
          orgId: req.permission.orgId,
          event: {
            type: EventType.RESOURCE_AUTH_METHOD_UPDATE,
            metadata: {
              resourceType: "kmip",
              resourceId: req.params.kmipServerId,
              method: view.method as "aws" | "token",
              methodConfigId: "config" in view && "id" in view.config ? view.config.id : req.params.kmipServerId
            }
          }
        });

        const canRevoke = await server.services.resourceAuthMethod.canRevoke(kmipServer, "kmip");
        return { ...kmipServer, canRevoke, authMethod: view };
      }

      const view = await server.services.resourceAuthMethod.getByKmipServerId({
        resource: { type: "kmip", id: req.params.kmipServerId },
        actor: req.permission
      });
      const canRevoke = await server.services.resourceAuthMethod.canRevoke(kmipServer, "kmip");
      return { ...kmipServer, canRevoke, authMethod: view };
    }
  });

  // ─── POST /:kmipServerId/token-auth/generate-enrollment-token ─────────────
  server.route({
    method: "POST",
    url: "/:kmipServerId/token-auth/generate-enrollment-token",
    config: { rateLimit: writeLimit },
    schema: {
      params: z.object({ kmipServerId: z.string().uuid() }),
      response: {
        200: z.object({ token: z.string(), expiresAt: z.date() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const result = await server.services.resourceAuthMethod.mintToken({
        resource: { type: "kmip", id: req.params.kmipServerId },
        actor: req.permission
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.KMIP_SERVER_ENROLLMENT_TOKEN_CREATE,
          metadata: { tokenId: result.id, name: result.resourceName }
        }
      });

      return { token: result.token, expiresAt: result.expiresAt };
    }
  });

  // ─── POST /:kmipServerId/revoke ───────────────────────────────────────────
  server.route({
    method: "POST",
    url: "/:kmipServerId/revoke",
    config: { rateLimit: writeLimit },
    schema: {
      params: z.object({ kmipServerId: z.string().uuid() }),
      response: {
        200: z.object({ method: z.string(), deletedTokenCount: z.number() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const result = await server.services.resourceAuthMethod.revokeAccess({
        resource: { type: "kmip", id: req.params.kmipServerId },
        actor: req.permission
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.RESOURCE_AUTH_METHOD_REVOKE,
          metadata: {
            resourceType: "kmip",
            resourceId: req.params.kmipServerId,
            method: result.method,
            resourceName: result.resourceName,
            deletedTokenCount: result.deletedTokenCount
          }
        }
      });

      return { method: result.method, deletedTokenCount: result.deletedTokenCount };
    }
  });

  // ─── DELETE /:kmipServerId ────────────────────────────────────────────────
  server.route({
    method: "DELETE",
    url: "/:kmipServerId",
    config: { rateLimit: writeLimit },
    schema: {
      params: z.object({ kmipServerId: z.string().uuid() }),
      response: {
        200: SanitizedKmipServerSchema.omit({ canRevoke: true })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const kmipServer = await server.services.kmipServer.deleteKmipServer({
        kmipServerId: req.params.kmipServerId,
        actor: req.permission
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.KMIP_SERVER_DELETE,
          metadata: { kmipServerId: kmipServer.id, name: kmipServer.name }
        }
      });

      return kmipServer;
    }
  });

  // ─── POST /login ──────────────────────────────────────────────────────────
  server.route({
    method: "POST",
    url: "/login",
    config: { rateLimit: loginRateLimit },
    schema: {
      body: z.discriminatedUnion("method", [
        z.object({
          method: z.literal(ResourceAuthMethodType.Aws),
          kmipServerId: z.string().uuid(),
          iamHttpRequestMethod: z.string().default("POST"),
          iamRequestBody: z.string(),
          iamRequestHeaders: z.string()
        }),
        z.object({
          method: z.literal(ResourceAuthMethodType.Token),
          token: z.string().min(1)
        })
      ]),
      response: {
        200: z.object({
          accessToken: z.string(),
          kmipServerId: z.string(),
          tokenType: z.literal("Bearer")
        })
      }
    },
    handler: async (req) => {
      if (req.body.method === ResourceAuthMethodType.Aws) {
        try {
          const result = await server.services.resourceAuthMethod.loginWithAws({
            resource: { type: "kmip", id: req.body.kmipServerId },
            iamHttpRequestMethod: req.body.iamHttpRequestMethod,
            iamRequestBody: req.body.iamRequestBody,
            iamRequestHeaders: req.body.iamRequestHeaders
          });

          await server.services.auditLog
            .createAuditLog({
              orgId: result.orgId,
              actor: { type: ActorType.KMIP_SERVER, metadata: { kmipServerId: result.resourceId } },
              event: {
                type: EventType.RESOURCE_AUTH_METHOD_LOGIN,
                metadata: {
                  resourceType: "kmip",
                  resourceId: result.resourceId,
                  method: "aws",
                  methodConfigId: result.config.id,
                  principalArn: result.principalArn,
                  accountId: result.accountId
                }
              },
              ipAddress: req.ip,
              userAgent: req.headers["user-agent"] ?? "",
              userAgentType: UserAgentType.OTHER
            })
            .catch(() => {});

          return {
            accessToken: result.accessToken,
            kmipServerId: result.resourceId,
            tokenType: "Bearer" as const
          };
        } catch (error) {
          if (error instanceof UnauthorizedError && error.detail?.resourceId) {
            await server.services.auditLog
              .createAuditLog({
                orgId: error.detail.orgId as string,
                actor: { type: ActorType.KMIP_SERVER, metadata: { kmipServerId: error.detail.resourceId as string } },
                event: {
                  type: EventType.RESOURCE_AUTH_METHOD_LOGIN_FAILED,
                  metadata: {
                    resourceType: "kmip",
                    resourceId: error.detail.resourceId as string,
                    method: "aws",
                    reasonCode: error.detail.reasonCode as string,
                    message: error.message,
                    principalArn: error.detail.principalArn as string | undefined,
                    accountId: error.detail.accountId as string | undefined
                  }
                },
                ipAddress: req.ip,
                userAgent: req.headers["user-agent"] ?? "",
                userAgentType: UserAgentType.OTHER
              })
              .catch(() => {});
          }
          throw error;
        }
      }

      const result = await server.services.resourceAuthMethod.loginWithToken({
        token: req.body.token,
        expectedResourceType: "kmip"
      });

      await server.services.auditLog
        .createAuditLog({
          orgId: result.orgId,
          actor: { type: ActorType.KMIP_SERVER, metadata: { kmipServerId: result.resourceId } },
          event: {
            type: EventType.RESOURCE_AUTH_METHOD_LOGIN,
            metadata: {
              resourceType: "kmip",
              resourceId: result.resourceId,
              method: "token",
              methodConfigId: result.resourceId,
              enrollmentTokenId: result.enrollmentTokenId
            }
          },
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"] ?? "",
          userAgentType: UserAgentType.CLI
        })
        .catch(() => {});

      return {
        accessToken: result.accessToken,
        kmipServerId: result.resourceId,
        tokenType: "Bearer" as const
      };
    }
  });
};
