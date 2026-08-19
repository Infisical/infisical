import z from "zod";

import { GatewaysV2Schema } from "@app/db/schemas";
import { EventType, UserAgentType } from "@app/ee/services/audit-log/audit-log-types";
import { validateAccountIds, validatePrincipalArns } from "@app/ee/services/resource-auth-method/aws-auth-validators";
import {
  validateAllowedNames,
  validateAllowedNamespaces,
  validateKubernetesHost
} from "@app/ee/services/resource-auth-method/kubernetes-auth-validators";
import {
  KubernetesTokenReviewMode,
  ResourceAuthMethodType
} from "@app/ee/services/resource-auth-method/resource-auth-method-fns";
import { AuthMethodViewSchema } from "@app/ee/services/resource-auth-method/resource-auth-method-schemas";
import { ApiDocsTags, GATEWAYS } from "@app/lib/api-docs";
import { UnauthorizedError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
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
  heartbeatTTL: true
}).extend({
  canRevoke: z.boolean()
});

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
      .max(255)
      .default("https://sts.amazonaws.com/")
      .describe(GATEWAYS.AUTH_METHOD.stsEndpoint),
    allowedPrincipalArns: validatePrincipalArns.describe(GATEWAYS.AUTH_METHOD.allowedPrincipalArns),
    allowedAccountIds: validateAccountIds
      .refine((val) => val.length <= 2048, "Allowed account IDs must be at most 2048 characters")
      .describe(GATEWAYS.AUTH_METHOD.allowedAccountIds)
  })
  .refine((data) => data.allowedPrincipalArns.trim().length > 0 || data.allowedAccountIds.trim().length > 0, {
    message: "At least one of allowedPrincipalArns or allowedAccountIds must be set",
    path: ["allowedPrincipalArns"]
  });

const KubernetesAuthMethodInputSchema = z
  .object({
    method: z.literal(ResourceAuthMethodType.Kubernetes),
    kubernetesHost: validateKubernetesHost.optional().describe(GATEWAYS.AUTH_METHOD.kubernetesHost),
    caCertificate: z.string().trim().max(10240).optional().describe(GATEWAYS.AUTH_METHOD.caCertificate),
    tokenReviewerJwt: z.string().trim().max(8192).optional().describe(GATEWAYS.AUTH_METHOD.tokenReviewerJwt),
    tokenReviewMode: z
      .nativeEnum(KubernetesTokenReviewMode)
      .default(KubernetesTokenReviewMode.Api)
      .describe(GATEWAYS.AUTH_METHOD.tokenReviewMode),
    gatewayId: z.string().uuid().nullable().optional().describe(GATEWAYS.AUTH_METHOD.gatewayId),
    gatewayPoolId: z.string().uuid().nullable().optional().describe(GATEWAYS.AUTH_METHOD.gatewayPoolId),
    allowedNamespaces: validateAllowedNamespaces.describe(GATEWAYS.AUTH_METHOD.allowedNamespaces),
    allowedNames: validateAllowedNames.describe(GATEWAYS.AUTH_METHOD.allowedNames),
    allowedAudience: z.string().trim().max(255).default("").describe(GATEWAYS.AUTH_METHOD.allowedAudience),
    verifyTlsCertificate: z.boolean().default(true).describe(GATEWAYS.AUTH_METHOD.verifyTlsCertificate)
  })
  .refine((data) => data.allowedNamespaces.trim().length > 0 || data.allowedNames.trim().length > 0, {
    message: "At least one of allowedNamespaces or allowedNames must be set",
    path: ["allowedNamespaces"]
  })
  .refine((data) => !(data.gatewayId && data.gatewayPoolId), {
    message: "Select either a gateway or a gateway pool to review tokens, not both",
    path: ["gatewayPoolId"]
  })
  .refine((data) => data.tokenReviewMode !== KubernetesTokenReviewMode.Gateway || Boolean(data.gatewayId), {
    message: "Gateway review mode requires a specific gateway to perform the review",
    path: ["gatewayId"]
  })
  // In this mode the selected gateway supplies the TokenReview verdict, so it is the attestor for
  // every login. Pool membership can change afterwards under a different permission, which would
  // let a pool editor add a gateway they control and have it authenticate as this one.
  .refine((data) => data.tokenReviewMode !== KubernetesTokenReviewMode.Gateway || !data.gatewayPoolId, {
    message:
      "A gateway pool cannot perform the review, because its membership can change after this is saved. Select a specific gateway.",
    path: ["gatewayPoolId"]
  })
  // The gateway calls its own API server in gateway review mode, so a host there is not merely
  // unnecessary, it is unused: accepting one lets a host be parked and picked up by a later
  // switch back to API mode.
  .refine((data) => data.tokenReviewMode !== KubernetesTokenReviewMode.Gateway || !data.kubernetesHost, {
    message: "A Kubernetes host does not apply when the gateway performs the review. Remove it.",
    path: ["kubernetesHost"]
  })
  // Only gateway review mode can go without a host, because there the gateway calls its own
  // API server rather than an address we supply.
  .refine((data) => data.tokenReviewMode === KubernetesTokenReviewMode.Gateway || Boolean(data.kubernetesHost), {
    message: "A Kubernetes host is required unless the review mode is Gateway as Reviewer",
    path: ["kubernetesHost"]
  });

const TokenAuthMethodInputSchema = z.object({
  method: z.literal(ResourceAuthMethodType.Token)
});

// Settable methods only — `identity` is read-only and never accepted as input.
const SettableAuthMethodInputSchema = z.union([
  AwsAuthMethodInputSchema,
  KubernetesAuthMethodInputSchema,
  TokenAuthMethodInputSchema
]);

type TSettableAuthMethodInput = z.infer<typeof SettableAuthMethodInputSchema>;

// createGateway takes { method, config }; setMethod takes the config flattened onto the method.
const toCreateAuthMethodArg = (input: TSettableAuthMethodInput) => {
  if (input.method === ResourceAuthMethodType.Aws) {
    return {
      method: ResourceAuthMethodType.Aws,
      config: {
        stsEndpoint: input.stsEndpoint,
        allowedPrincipalArns: input.allowedPrincipalArns,
        allowedAccountIds: input.allowedAccountIds
      }
    } as const;
  }
  if (input.method === ResourceAuthMethodType.Kubernetes) {
    return {
      method: ResourceAuthMethodType.Kubernetes,
      config: {
        kubernetesHost: input.kubernetesHost,
        caCertificate: input.caCertificate,
        tokenReviewerJwt: input.tokenReviewerJwt,
        tokenReviewMode: input.tokenReviewMode,
        gatewayV2Id: input.gatewayId,
        gatewayPoolId: input.gatewayPoolId,
        allowedNamespaces: input.allowedNamespaces,
        allowedNames: input.allowedNames,
        allowedAudience: input.allowedAudience,
        verifyTlsCertificate: input.verifyTlsCertificate
      }
    } as const;
  }
  return { method: ResourceAuthMethodType.Token } as const;
};

const toSetAuthMethodArg = (input: TSettableAuthMethodInput) => {
  if (input.method === ResourceAuthMethodType.Aws) {
    return {
      method: ResourceAuthMethodType.Aws,
      stsEndpoint: input.stsEndpoint,
      allowedPrincipalArns: input.allowedPrincipalArns,
      allowedAccountIds: input.allowedAccountIds
    } as const;
  }
  if (input.method === ResourceAuthMethodType.Kubernetes) {
    return {
      method: ResourceAuthMethodType.Kubernetes,
      kubernetesHost: input.kubernetesHost,
      caCertificate: input.caCertificate,
      tokenReviewerJwt: input.tokenReviewerJwt,
      tokenReviewMode: input.tokenReviewMode,
      gatewayV2Id: input.gatewayId,
      gatewayPoolId: input.gatewayPoolId,
      allowedNamespaces: input.allowedNamespaces,
      allowedNames: input.allowedNames,
      allowedAudience: input.allowedAudience,
      verifyTlsCertificate: input.verifyTlsCertificate
    } as const;
  }
  return { method: ResourceAuthMethodType.Token } as const;
};

export const registerGatewayV3Router = async (server: FastifyZodProvider) => {
  // ─── POST / ──────────────────────────────────────────────────────────────
  // Create a gateway. Body requires `authMethod` so create-and-configure happen in one call.
  server.route({
    method: "POST",
    url: "/",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "createGateway",
      tags: [ApiDocsTags.GatewaysV3],
      body: z.object({
        name: slugSchema({ field: "name" }).describe(GATEWAYS.CREATE.name),
        authMethod: SettableAuthMethodInputSchema.describe(GATEWAYS.CREATE.authMethod)
      }),
      response: {
        200: GatewayWithAuthMethodSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const authMethodArg = toCreateAuthMethodArg(req.body.authMethod);

      const gateway = await server.services.gatewayV2.createGateway({
        orgId: req.permission.orgId,
        actorId: req.permission.id,
        actorType: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        name: req.body.name,
        authMethod: authMethodArg
      });

      const view = await server.services.resourceAuthMethod.loadView({ type: "gateway", id: gateway.id });
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
      hide: false,
      operationId: "getGateway",
      tags: [ApiDocsTags.GatewaysV3],
      params: z.object({ gatewayId: z.string().trim().uuid() }),
      response: { 200: GatewayWithAuthMethodSchema }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
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
      hide: false,
      operationId: "updateGateway",
      tags: [ApiDocsTags.GatewaysV3],
      params: z.object({ gatewayId: z.string().trim().uuid() }),
      body: z.object({
        authMethod: SettableAuthMethodInputSchema.optional().describe(GATEWAYS.UPDATE.authMethod)
      }),
      response: { 200: GatewayWithAuthMethodSchema }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      if (req.body.authMethod) {
        const setInput = toSetAuthMethodArg(req.body.authMethod);

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
              method: result.method as "aws" | "kubernetes" | "token",
              methodConfigId:
                result.method === ResourceAuthMethodType.Aws || result.method === ResourceAuthMethodType.Kubernetes
                  ? result.config.id
                  : req.params.gatewayId,
              ...(result.method === ResourceAuthMethodType.Aws
                ? {
                    stsEndpoint: result.config.stsEndpoint,
                    allowedPrincipalArns: result.config.allowedPrincipalArns,
                    allowedAccountIds: result.config.allowedAccountIds
                  }
                : {}),
              ...(result.method === ResourceAuthMethodType.Kubernetes
                ? {
                    kubernetesHost: result.config.kubernetesHost,
                    allowedNamespaces: result.config.allowedNamespaces,
                    allowedNames: result.config.allowedNames,
                    allowedAudience: result.config.allowedAudience
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
              method: result.method as "aws" | "kubernetes" | "token"
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
      hide: false,
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
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
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
          metadata: { tokenId: result.id, name: result.resourceName }
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
          method: z.enum(["aws", "kubernetes", "token"])
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
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
            resourceName: result.resourceName
          }
        }
      });

      return { method: result.method };
    }
  });

  // ─── POST /login ─────────────────────────────────────────────────────────
  // Gateway login. Discriminated body covers every method. Single rate limit (10/min).
  server.route({
    method: "POST",
    url: "/login",
    config: { rateLimit: loginRateLimit },
    schema: {
      operationId: "loginGateway",
      tags: [ApiDocsTags.GatewaysV3],
      description: "Gateway login. Body discriminates on `method` for AWS, Kubernetes, or token authentication.",
      body: z.discriminatedUnion("method", [
        z.object({
          method: z.literal(ResourceAuthMethodType.Aws),
          gatewayId: z.string().trim().uuid().describe(GATEWAYS.LOGIN.gatewayId),
          iamHttpRequestMethod: z.string().default("POST").describe(GATEWAYS.LOGIN.iamHttpRequestMethod),
          iamRequestBody: z.string().describe(GATEWAYS.LOGIN.iamRequestBody),
          iamRequestHeaders: z.string().describe(GATEWAYS.LOGIN.iamRequestHeaders)
        }),
        z.object({
          method: z.literal(ResourceAuthMethodType.Kubernetes),
          gatewayId: z.string().trim().uuid().describe(GATEWAYS.LOGIN.gatewayId),
          jwt: z.string().trim().min(1).max(8192).describe(GATEWAYS.LOGIN.jwt)
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
              orgId: result.orgId,
              actor: { type: ActorType.GATEWAY, metadata: { gatewayId: result.resourceId } },
              event: {
                type: EventType.RESOURCE_AUTH_METHOD_LOGIN,
                metadata: {
                  resourceType: "gateway",
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

          void server.services.telemetry
            .sendPostHogEvents({
              event: PostHogEventTypes.ResourceAuthMethodLogin,
              distinctId: `gateway-${result.resourceId}`,
              organizationId: result.orgId,
              properties: {
                resourceType: "gateway",
                resourceId: result.resourceId,
                orgId: result.orgId,
                method: "aws"
              }
            })
            .catch((err) => {
              logger.error(err, `Failed to send telemetry [gatewayId=${result.resourceId}]`);
            });

          return {
            accessToken: result.accessToken,
            gatewayId: result.resourceId,
            tokenType: "Bearer" as const
          };
        } catch (error) {
          if (error instanceof UnauthorizedError && error.detail?.resourceId) {
            await server.services.auditLog
              .createAuditLog({
                orgId: error.detail.orgId as string,
                actor: { type: ActorType.GATEWAY, metadata: { gatewayId: error.detail.resourceId as string } },
                event: {
                  type: EventType.RESOURCE_AUTH_METHOD_LOGIN_FAILED,
                  metadata: {
                    resourceType: "gateway",
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

      if (req.body.method === ResourceAuthMethodType.Kubernetes) {
        try {
          const result = await server.services.resourceAuthMethod.loginWithKubernetes({
            resource: { type: "gateway", id: req.body.gatewayId },
            jwt: req.body.jwt
          });

          await server.services.auditLog
            .createAuditLog({
              orgId: result.orgId,
              actor: { type: ActorType.GATEWAY, metadata: { gatewayId: result.resourceId } },
              event: {
                type: EventType.RESOURCE_AUTH_METHOD_LOGIN,
                metadata: {
                  resourceType: "gateway",
                  resourceId: result.resourceId,
                  method: ResourceAuthMethodType.Kubernetes,
                  methodConfigId: result.configId,
                  kubernetesNamespace: result.namespace,
                  kubernetesServiceAccountName: result.serviceAccountName
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
              distinctId: `gateway-${result.resourceId}`,
              organizationId: result.orgId,
              properties: {
                resourceType: "gateway",
                resourceId: result.resourceId,
                orgId: result.orgId,
                method: ResourceAuthMethodType.Kubernetes
              }
            })
            .catch((err) => {
              logger.error(err, `Failed to send telemetry [gatewayId=${result.resourceId}]`);
            });

          return {
            accessToken: result.accessToken,
            gatewayId: result.resourceId,
            tokenType: "Bearer" as const
          };
        } catch (error) {
          if (error instanceof UnauthorizedError && error.detail?.resourceId) {
            await server.services.auditLog
              .createAuditLog({
                orgId: error.detail.orgId as string,
                actor: { type: ActorType.GATEWAY, metadata: { gatewayId: error.detail.resourceId as string } },
                event: {
                  type: EventType.RESOURCE_AUTH_METHOD_LOGIN_FAILED,
                  metadata: {
                    resourceType: "gateway",
                    resourceId: error.detail.resourceId as string,
                    method: ResourceAuthMethodType.Kubernetes,
                    reasonCode: error.detail.reasonCode as string,
                    message: error.message,
                    kubernetesNamespace: error.detail.namespace as string | undefined,
                    kubernetesServiceAccountName: error.detail.serviceAccountName as string | undefined
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
        expectedResourceType: "gateway"
      });

      await server.services.auditLog
        .createAuditLog({
          orgId: result.orgId,
          actor: { type: ActorType.GATEWAY, metadata: { gatewayId: result.resourceId } },
          event: {
            type: EventType.RESOURCE_AUTH_METHOD_LOGIN,
            metadata: {
              resourceType: "gateway",
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

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.ResourceAuthMethodLogin,
          distinctId: `gateway-${result.resourceId}`,
          organizationId: result.orgId,
          properties: {
            resourceType: "gateway",
            resourceId: result.resourceId,
            orgId: result.orgId,
            method: "token"
          }
        })
        .catch((err) => {
          logger.error(err, `Failed to send telemetry [gatewayId=${result.resourceId}]`);
        });

      return {
        accessToken: result.accessToken,
        gatewayId: result.resourceId,
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
      const result = await server.services.resourceAuthMethod.loginWithToken({
        token: req.body.token,
        expectedResourceType: "gateway"
      });

      await server.services.auditLog
        .createAuditLog({
          orgId: result.orgId,
          actor: { type: ActorType.GATEWAY, metadata: { gatewayId: result.resourceId } },
          event: {
            type: EventType.RESOURCE_AUTH_METHOD_LOGIN,
            metadata: {
              resourceType: "gateway",
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

      return { accessToken: result.accessToken, gatewayId: result.resourceId };
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
