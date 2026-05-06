import z from "zod";

import { GatewaysV2Schema } from "@app/db/schemas";
import { EventType, UserAgentType } from "@app/ee/services/audit-log/audit-log-types";
import { validateAccountIds, validatePrincipalArns } from "@app/ee/services/resource-auth-method/aws-auth-validators";
import { ResourceAuthMethodType } from "@app/ee/services/resource-auth-method/resource-auth-method-fns";
import { ApiDocsTags, GATEWAYS } from "@app/lib/api-docs";
import { UnauthorizedError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { ActorType, AuthMode } from "@app/services/auth/auth-type";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

const loginRateLimit = { windowMs: 60 * 1000, max: 10 };

const SanitizedGatewayV2Schema = GatewaysV2Schema.pick({
  id: true,
  identityId: true,
  name: true,
  createdAt: true,
  updatedAt: true,
  heartbeat: true,
  lastHealthCheckStatus: true
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

const GatewayWithAuthMethodSchema = SanitizedGatewayV2Schema.extend({
  authMethod: AuthMethodViewSchema
});

const AwsAuthMethodInputSchema = z
  .object({
    method: z.literal(ResourceAuthMethodType.Aws),
    stsEndpoint: z
      .string()
      .trim()
      .min(1)
      .default("https://sts.amazonaws.com/")
      .describe(GATEWAYS.AUTH_METHOD.stsEndpoint),
    allowedPrincipalArns: validatePrincipalArns.describe(GATEWAYS.AUTH_METHOD.allowedPrincipalArns),
    allowedAccountIds: validateAccountIds.describe(GATEWAYS.AUTH_METHOD.allowedAccountIds)
  })
  .refine((data) => data.allowedPrincipalArns.trim().length > 0 || data.allowedAccountIds.trim().length > 0, {
    message: "At least one of allowedPrincipalArns or allowedAccountIds must be set",
    path: ["allowedPrincipalArns"]
  });

const TokenAuthMethodInputSchema = z.object({
  method: z.literal(ResourceAuthMethodType.Token)
});

// Settable methods only — `identity` is read-only and never accepted as input.
const SettableAuthMethodInputSchema = z.union([AwsAuthMethodInputSchema, TokenAuthMethodInputSchema]);

export const registerGatewayV3Router = async (server: FastifyZodProvider) => {
  // ─── POST / ──────────────────────────────────────────────────────────────
  // Create a gateway. Body requires `authMethod` so create-and-configure happen in one call.
  server.route({
    method: "POST",
    url: "/",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "createGateway",
      tags: [ApiDocsTags.GatewaysV3],
      body: z.object({
        name: z.string().trim().min(1).max(64).describe(GATEWAYS.CREATE.name),
        authMethod: SettableAuthMethodInputSchema.describe(GATEWAYS.CREATE.authMethod)
      }),
      response: {
        200: GatewayWithAuthMethodSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const authMethodArg =
        req.body.authMethod.method === ResourceAuthMethodType.Aws
          ? {
              method: ResourceAuthMethodType.Aws,
              config: {
                stsEndpoint: req.body.authMethod.stsEndpoint,
                allowedPrincipalArns: req.body.authMethod.allowedPrincipalArns,
                allowedAccountIds: req.body.authMethod.allowedAccountIds
              }
            }
          : { method: ResourceAuthMethodType.Token };

      const gateway = await server.services.gatewayV2.createGateway({
        orgId: req.permission.orgId,
        actorId: req.permission.id,
        actorType: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        name: req.body.name,
        authMethod: authMethodArg
      });

      const view = await server.services.resourceAuthMethod.loadView(gateway.id);
      if (!view) throw new UnauthorizedError({ message: "Auth method missing after create" });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.GATEWAY_CREATE,
          metadata: { gatewayId: gateway.id, name: gateway.name }
        }
      });

      const canRevoke = await server.services.resourceAuthMethod.canRevoke(gateway);
      return { ...gateway, canRevoke, authMethod: view };
    }
  });

  // ─── GET /:gatewayId ─────────────────────────────────────────────────────
  // Single-gateway read — powers the details page.
  server.route({
    method: "GET",
    url: "/:gatewayId",
    config: { rateLimit: readLimit },
    schema: {
      operationId: "getGateway",
      tags: [ApiDocsTags.GatewaysV3],
      params: z.object({ gatewayId: z.string().trim().uuid() }),
      response: { 200: GatewayWithAuthMethodSchema }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const gateway = await server.services.gatewayV2.getGatewayById({ gatewayId: req.params.gatewayId });
      const view = await server.services.resourceAuthMethod.getByGatewayId({
        resource: { type: "gateway", id: req.params.gatewayId },
        actor: req.permission
      });
      const canRevoke = await server.services.resourceAuthMethod.canRevoke(gateway);
      return { ...gateway, canRevoke, authMethod: view };
    }
  });

  // ─── PATCH /:gatewayId ───────────────────────────────────────────────────
  server.route({
    method: "PATCH",
    url: "/:gatewayId",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "updateGateway",
      tags: [ApiDocsTags.GatewaysV3],
      params: z.object({ gatewayId: z.string().trim().uuid() }),
      body: z.object({
        authMethod: SettableAuthMethodInputSchema.optional().describe(GATEWAYS.UPDATE.authMethod)
      }),
      response: { 200: GatewayWithAuthMethodSchema }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      if (req.body.authMethod) {
        const setInput =
          req.body.authMethod.method === ResourceAuthMethodType.Aws
            ? {
                method: ResourceAuthMethodType.Aws,
                stsEndpoint: req.body.authMethod.stsEndpoint,
                allowedPrincipalArns: req.body.authMethod.allowedPrincipalArns,
                allowedAccountIds: req.body.authMethod.allowedAccountIds
              }
            : { method: ResourceAuthMethodType.Token };

        const result = await server.services.resourceAuthMethod.setMethod({
          resource: { type: "gateway", id: req.params.gatewayId },
          authMethod: setInput,
          actor: req.permission
        });

        await server.services.auditLog.createAuditLog({
          ...req.auditLogInfo,
          orgId: req.permission.orgId,
          event: {
            type: EventType.RESOURCE_AUTH_METHOD_UPDATE,
            metadata: {
              resourceType: "gateway",
              resourceId: req.params.gatewayId,
              method: result.method as "aws" | "token",
              methodConfigId: result.method === ResourceAuthMethodType.Aws ? result.config.id : req.params.gatewayId,
              ...(result.method === ResourceAuthMethodType.Aws
                ? {
                    stsEndpoint: result.config.stsEndpoint,
                    allowedPrincipalArns: result.config.allowedPrincipalArns,
                    allowedAccountIds: result.config.allowedAccountIds
                  }
                : {})
            }
          }
        });

        void server.services.telemetry
          .sendPostHogEvents({
            event: PostHogEventTypes.ResourceAuthMethodUpdated,
            distinctId: getTelemetryDistinctId(req),
            organizationId: req.permission.orgId,
            properties: {
              resourceType: "gateway",
              resourceId: req.params.gatewayId,
              orgId: req.permission.orgId,
              method: result.method as "aws" | "token"
            }
          })
          .catch((err) => {
            logger.error(err, `Failed to send telemetry [gatewayId=${req.params.gatewayId}]`);
          });
      }

      const gateway = await server.services.gatewayV2.getGatewayById({ gatewayId: req.params.gatewayId });
      const view = await server.services.resourceAuthMethod.getByGatewayId({
        resource: { type: "gateway", id: req.params.gatewayId },
        actor: req.permission
      });
      const canRevoke = await server.services.resourceAuthMethod.canRevoke(gateway);
      return { ...gateway, canRevoke, authMethod: view };
    }
  });

  // ─── POST /:gatewayId/token-auth/generate-enrollment-token ────────────────
  server.route({
    method: "POST",
    url: "/:gatewayId/token-auth/generate-enrollment-token",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "mintGatewayEnrollmentToken",
      tags: [ApiDocsTags.GatewaysV3],
      params: z.object({ gatewayId: z.string().trim().uuid() }),
      response: {
        200: z.object({
          token: z.string(),
          expiresAt: z.date()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const result = await server.services.resourceAuthMethod.mintToken({
        resource: { type: "gateway", id: req.params.gatewayId },
        actor: req.permission
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.GATEWAY_ENROLLMENT_TOKEN_CREATE,
          metadata: { tokenId: result.id, name: result.gatewayName }
        }
      });

      return { token: result.token, expiresAt: result.expiresAt };
    }
  });

  // ─── POST /:gatewayId/revoke ─────────────────────────────────────────────
  // Disconnect the running gateway and invalidate any outstanding enrollment tokens.
  server.route({
    method: "POST",
    url: "/:gatewayId/revoke",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "revokeGatewayAccess",
      tags: [ApiDocsTags.GatewaysV3],
      params: z.object({ gatewayId: z.string().trim().uuid() }),
      response: {
        200: z.object({
          method: z.enum(["aws", "token"]),
          deletedTokenCount: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const result = await server.services.resourceAuthMethod.revokeAccess({
        resource: { type: "gateway", id: req.params.gatewayId },
        actor: req.permission
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.RESOURCE_AUTH_METHOD_REVOKE,
          metadata: {
            resourceType: "gateway",
            resourceId: req.params.gatewayId,
            method: result.method,
            gatewayName: result.gatewayName,
            deletedTokenCount: result.deletedTokenCount
          }
        }
      });

      return { method: result.method, deletedTokenCount: result.deletedTokenCount };
    }
  });

  // ─── POST /login ─────────────────────────────────────────────────────────
  // Gateway login. Discriminated body covers both methods. Single rate limit (10/min).
  server.route({
    method: "POST",
    url: "/login",
    config: { rateLimit: loginRateLimit },
    schema: {
      operationId: "loginGateway",
      tags: [ApiDocsTags.GatewaysV3],
      description: "Gateway login. Body discriminates on `method` for AWS or token authentication.",
      body: z.discriminatedUnion("method", [
        z.object({
          method: z.literal(ResourceAuthMethodType.Aws),
          gatewayId: z.string().trim().uuid().describe(GATEWAYS.LOGIN.gatewayId),
          iamHttpRequestMethod: z.string().default("POST").describe(GATEWAYS.LOGIN.iamHttpRequestMethod),
          iamRequestBody: z.string().describe(GATEWAYS.LOGIN.iamRequestBody),
          iamRequestHeaders: z.string().describe(GATEWAYS.LOGIN.iamRequestHeaders)
        }),
        z.object({
          method: z.literal(ResourceAuthMethodType.Token),
          token: z.string().min(1).describe(GATEWAYS.LOGIN.token)
        })
      ]),
      response: {
        200: z.object({
          accessToken: z.string(),
          gatewayId: z.string(),
          tokenType: z.literal("Bearer")
        })
      }
    },
    handler: async (req) => {
      if (req.body.method === ResourceAuthMethodType.Aws) {
        try {
          const result = await server.services.resourceAuthMethod.loginWithAws({
            resource: { type: "gateway", id: req.body.gatewayId },
            iamHttpRequestMethod: req.body.iamHttpRequestMethod,
            iamRequestBody: req.body.iamRequestBody,
            iamRequestHeaders: req.body.iamRequestHeaders
          });

          await server.services.auditLog
            .createAuditLog({
              orgId: result.gateway.orgId,
              actor: { type: ActorType.GATEWAY, metadata: { gatewayId: result.gateway.id } },
              event: {
                type: EventType.RESOURCE_AUTH_METHOD_LOGIN,
                metadata: {
                  resourceType: "gateway",
                  resourceId: result.gateway.id,
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

          void server.services.telemetry
            .sendPostHogEvents({
              event: PostHogEventTypes.ResourceAuthMethodLogin,
              distinctId: `gateway-${result.gateway.id}`,
              organizationId: result.gateway.orgId,
              properties: {
                resourceType: "gateway",
                resourceId: result.gateway.id,
                orgId: result.gateway.orgId,
                method: "aws"
              }
            })
            .catch((err) => {
              logger.error(err, `Failed to send telemetry [gatewayId=${result.gateway.id}]`);
            });

          return {
            accessToken: result.accessToken,
            gatewayId: result.gateway.id,
            tokenType: "Bearer" as const
          };
        } catch (error) {
          if (error instanceof UnauthorizedError && error.detail?.gatewayId) {
            await server.services.auditLog
              .createAuditLog({
                orgId: error.detail.orgId as string,
                actor: { type: ActorType.GATEWAY, metadata: { gatewayId: error.detail.gatewayId as string } },
                event: {
                  type: EventType.RESOURCE_AUTH_METHOD_LOGIN_FAILED,
                  metadata: {
                    resourceType: "gateway",
                    resourceId: error.detail.gatewayId as string,
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

      const result = await server.services.resourceAuthMethod.loginWithToken({ token: req.body.token });

      await server.services.auditLog
        .createAuditLog({
          orgId: result.orgId,
          actor: { type: ActorType.GATEWAY, metadata: { gatewayId: result.gatewayId } },
          event: {
            type: EventType.RESOURCE_AUTH_METHOD_LOGIN,
            metadata: {
              resourceType: "gateway",
              resourceId: result.gatewayId,
              method: "token",
              methodConfigId: result.gatewayId,
              enrollmentTokenId: result.enrollmentTokenId
            }
          },
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"] ?? "",
          userAgentType: UserAgentType.CLI
        })
        .catch(() => {});

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.ResourceAuthMethodLogin,
          distinctId: `gateway-${result.gatewayId}`,
          organizationId: result.orgId,
          properties: {
            resourceType: "gateway",
            resourceId: result.gatewayId,
            orgId: result.orgId,
            method: "token"
          }
        })
        .catch((err) => {
          logger.error(err, `Failed to send telemetry [gatewayId=${result.gatewayId}]`);
        });

      return {
        accessToken: result.accessToken,
        gatewayId: result.gatewayId,
        tokenType: "Bearer" as const
      };
    }
  });

  // ─── POST /token-auth/enroll  (DEPRECATED) ────────────────────────────────
  // Kept for deployed gateway CLIs that hardcode this URL. New CLIs hit POST /v3/gateways/login.
  server.route({
    method: "POST",
    url: "/token-auth/enroll",
    config: { rateLimit: loginRateLimit },
    schema: {
      operationId: "enrollGatewayWithToken",
      deprecated: true,
      description: 'Deprecated. Use POST /v3/gateways/login with body { method: "token", token } instead.',
      body: z.object({ token: z.string().min(1) }),
      response: {
        200: z.object({ accessToken: z.string(), gatewayId: z.string() })
      }
    },
    handler: async (req) => {
      const result = await server.services.resourceAuthMethod.loginWithToken({ token: req.body.token });

      await server.services.auditLog
        .createAuditLog({
          orgId: result.orgId,
          actor: { type: ActorType.GATEWAY, metadata: { gatewayId: result.gatewayId } },
          event: {
            type: EventType.RESOURCE_AUTH_METHOD_LOGIN,
            metadata: {
              resourceType: "gateway",
              resourceId: result.gatewayId,
              method: "token",
              methodConfigId: result.gatewayId,
              enrollmentTokenId: result.enrollmentTokenId
            }
          },
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"] ?? "",
          userAgentType: UserAgentType.CLI
        })
        .catch(() => {});

      return { accessToken: result.accessToken, gatewayId: result.gatewayId };
    }
  });

  // ─── POST /connect ───────────────────────────────────────────────────────
  // Gateway connect.
  server.route({
    method: "POST",
    url: "/connect",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "connectGateway",
      body: z.object({
        relayName: z.string().trim().min(1).max(32).optional()
      }),
      response: {
        200: z.object({
          gatewayId: z.string(),
          relayHost: z.string(),
          pki: z.object({
            serverCertificate: z.string(),
            serverPrivateKey: z.string(),
            clientCertificateChain: z.string()
          }),
          ssh: z.object({
            clientCertificate: z.string(),
            clientPrivateKey: z.string(),
            serverCAPublicKey: z.string()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.GATEWAY_ACCESS_TOKEN]),
    handler: async (req) => {
      return server.services.gatewayV2.connectGateway({
        orgId: req.permission.orgId,
        actorId: req.permission.id,
        actorType: req.permission.type,
        relayName: req.body.relayName
      });
    }
  });
};
