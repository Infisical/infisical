import z from "zod";

import { RelaysSchema } from "@app/db/schemas";
import { EventType, UserAgentType } from "@app/ee/services/audit-log/audit-log-types";
import { validateAccountIds, validatePrincipalArns } from "@app/ee/services/resource-auth-method/aws-auth-validators";
import { ResourceAuthMethodType } from "@app/ee/services/resource-auth-method/resource-auth-method-fns";
import { UnauthorizedError } from "@app/lib/errors";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { ActorType, AuthMode } from "@app/services/auth/auth-type";

const loginRateLimit = { windowMs: 60 * 1000, max: 10 };

const SanitizedRelaySchema = RelaysSchema.pick({
  id: true,
  identityId: true,
  name: true,
  host: true,
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

const RelayWithAuthMethodSchema = SanitizedRelaySchema.extend({
  authMethod: AuthMethodViewSchema
});

const AwsAuthMethodInputSchema = z
  .object({
    method: z.literal(ResourceAuthMethodType.Aws),
    stsEndpoint: z.string().trim().min(1).max(255).default("https://sts.amazonaws.com/"),
    allowedPrincipalArns: validatePrincipalArns,
    allowedAccountIds: validateAccountIds.refine(
      (val) => val.length <= 2048,
      "Allowed account IDs must be at most 2048 characters"
    )
  })
  .refine((data) => data.allowedPrincipalArns.trim().length > 0 || data.allowedAccountIds.trim().length > 0, {
    message: "At least one of allowedPrincipalArns or allowedAccountIds must be set",
    path: ["allowedPrincipalArns"]
  });

const TokenAuthMethodInputSchema = z.object({
  method: z.literal(ResourceAuthMethodType.Token)
});

const SettableAuthMethodInputSchema = z.union([AwsAuthMethodInputSchema, TokenAuthMethodInputSchema]);

export const registerRelayV2Router = async (server: FastifyZodProvider) => {
  // ─── POST / (Create Relay) ────────────────────────────────────────────────
  server.route({
    method: "POST",
    url: "/",
    config: { rateLimit: writeLimit },
    schema: {
      description: "Create a new relay with an initial auth method.",
      body: z.object({
        name: slugSchema({ min: 1, max: 32, field: "name" }),
        host: z.string().trim().min(1),
        authMethod: SettableAuthMethodInputSchema
      }),
      response: {
        200: RelayWithAuthMethodSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { authMethod: authMethodInput, ...rest } = req.body;
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

      const relay = await server.services.relay.createRelay({
        ...rest,
        authMethod: authMethodArg,
        actor: {
          type: req.permission.type,
          id: req.permission.id,
          orgId: req.permission.orgId,
          authMethod: req.permission.authMethod
        }
      });

      const view = await server.services.resourceAuthMethod.loadView({ type: "relay", id: relay.id });
      if (!view) throw new UnauthorizedError({ message: "Auth method missing after create" });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.RELAY_CREATE,
          metadata: { relayId: relay.id, name: relay.name }
        }
      });

      const canRevoke = await server.services.resourceAuthMethod.canRevoke(relay, "relay");

      return { ...relay, canRevoke, authMethod: view };
    }
  });

  // ─── GET /:relayId ────────────────────────────────────────────────────────
  server.route({
    method: "GET",
    url: "/:relayId",
    config: { rateLimit: readLimit },
    schema: {
      params: z.object({ relayId: z.string().uuid() }),
      response: {
        200: RelayWithAuthMethodSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const relay = await server.services.relay.getOrgRelay({
        relayId: req.params.relayId,
        orgId: req.permission.orgId
      });

      const view = await server.services.resourceAuthMethod.getByRelayId({
        resource: { type: "relay", id: req.params.relayId },
        actor: req.permission
      });

      const canRevoke = await server.services.resourceAuthMethod.canRevoke(relay, "relay");

      return { ...relay, canRevoke, authMethod: view };
    }
  });

  // ─── GET /:relayId/gateways ─────────────────────────────────────────────
  server.route({
    method: "GET",
    url: "/:relayId/gateways",
    config: { rateLimit: readLimit },
    schema: {
      params: z.object({ relayId: z.string().uuid() }),
      response: {
        200: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            createdAt: z.date(),
            heartbeat: z.date().nullable().optional()
          })
        )
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      return server.services.relay.getConnectedGateways({
        relayId: req.params.relayId,
        orgPermission: req.permission
      });
    }
  });

  // ─── PATCH /:relayId ──────────────────────────────────────────────────────
  server.route({
    method: "PATCH",
    url: "/:relayId",
    config: { rateLimit: writeLimit },
    schema: {
      params: z.object({ relayId: z.string().uuid() }),
      body: z.object({
        host: z.string().trim().min(1).optional(),
        authMethod: SettableAuthMethodInputSchema.optional()
      }),
      response: {
        200: RelayWithAuthMethodSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      let relay;

      if (req.body.host) {
        relay = await server.services.relay.updateRelay({
          relayId: req.params.relayId,
          host: req.body.host,
          actor: req.permission
        });

        await server.services.auditLog.createAuditLog({
          ...req.auditLogInfo,
          orgId: req.permission.orgId,
          event: {
            type: EventType.RELAY_UPDATE,
            metadata: { relayId: req.params.relayId, name: relay.name, host: req.body.host }
          }
        });
      } else {
        relay = await server.services.relay.getOrgRelay({
          relayId: req.params.relayId,
          orgId: req.permission.orgId
        });
      }

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
          resource: { type: "relay", id: req.params.relayId },
          authMethod: authMethodArg,
          actor: req.permission
        });

        await server.services.auditLog.createAuditLog({
          ...req.auditLogInfo,
          orgId: req.permission.orgId,
          event: {
            type: EventType.RESOURCE_AUTH_METHOD_UPDATE,
            metadata: {
              resourceType: "relay",
              resourceId: req.params.relayId,
              method: view.method as "aws" | "token",
              methodConfigId: "config" in view && "id" in view.config ? view.config.id : req.params.relayId
            }
          }
        });

        const canRevoke = await server.services.resourceAuthMethod.canRevoke(relay, "relay");
        return { ...relay, canRevoke, authMethod: view };
      }

      const view = await server.services.resourceAuthMethod.getByRelayId({
        resource: { type: "relay", id: req.params.relayId },
        actor: req.permission
      });
      const canRevoke = await server.services.resourceAuthMethod.canRevoke(relay, "relay");
      return { ...relay, canRevoke, authMethod: view };
    }
  });

  // ─── POST /:relayId/token-auth/generate-enrollment-token ──────────────────
  server.route({
    method: "POST",
    url: "/:relayId/token-auth/generate-enrollment-token",
    config: { rateLimit: writeLimit },
    schema: {
      params: z.object({ relayId: z.string().uuid() }),
      response: {
        200: z.object({ token: z.string(), expiresAt: z.date() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const result = await server.services.resourceAuthMethod.mintToken({
        resource: { type: "relay", id: req.params.relayId },
        actor: req.permission
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.RELAY_ENROLLMENT_TOKEN_CREATE,
          metadata: { tokenId: result.id, name: result.resourceName }
        }
      });

      return { token: result.token, expiresAt: result.expiresAt };
    }
  });

  // ─── POST /:relayId/revoke ────────────────────────────────────────────────
  server.route({
    method: "POST",
    url: "/:relayId/revoke",
    config: { rateLimit: writeLimit },
    schema: {
      params: z.object({ relayId: z.string().uuid() }),
      response: {
        200: z.object({ method: z.string() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const result = await server.services.resourceAuthMethod.revokeAccess({
        resource: { type: "relay", id: req.params.relayId },
        actor: req.permission
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.RESOURCE_AUTH_METHOD_REVOKE,
          metadata: {
            resourceType: "relay",
            resourceId: req.params.relayId,
            method: result.method,
            resourceName: result.resourceName
          }
        }
      });

      return { method: result.method };
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
          relayId: z.string().uuid(),
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
          relayId: z.string(),
          tokenType: z.literal("Bearer")
        })
      }
    },
    handler: async (req) => {
      if (req.body.method === ResourceAuthMethodType.Aws) {
        try {
          const result = await server.services.resourceAuthMethod.loginWithAws({
            resource: { type: "relay", id: req.body.relayId },
            iamHttpRequestMethod: req.body.iamHttpRequestMethod,
            iamRequestBody: req.body.iamRequestBody,
            iamRequestHeaders: req.body.iamRequestHeaders
          });

          await server.services.auditLog
            .createAuditLog({
              orgId: result.orgId,
              actor: { type: ActorType.RELAY, metadata: { relayId: result.resourceId } },
              event: {
                type: EventType.RESOURCE_AUTH_METHOD_LOGIN,
                metadata: {
                  resourceType: "relay",
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
            relayId: result.resourceId,
            tokenType: "Bearer" as const
          };
        } catch (error) {
          if (error instanceof UnauthorizedError && error.detail?.resourceId) {
            await server.services.auditLog
              .createAuditLog({
                orgId: error.detail.orgId as string,
                actor: { type: ActorType.RELAY, metadata: { relayId: error.detail.resourceId as string } },
                event: {
                  type: EventType.RESOURCE_AUTH_METHOD_LOGIN_FAILED,
                  metadata: {
                    resourceType: "relay",
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
        expectedResourceType: "relay"
      });

      await server.services.auditLog
        .createAuditLog({
          orgId: result.orgId,
          actor: { type: ActorType.RELAY, metadata: { relayId: result.resourceId } },
          event: {
            type: EventType.RESOURCE_AUTH_METHOD_LOGIN,
            metadata: {
              resourceType: "relay",
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
        relayId: result.resourceId,
        tokenType: "Bearer" as const
      };
    }
  });

  // ─── POST /connect ────────────────────────────────────────────────────────
  server.route({
    method: "POST",
    url: "/connect",
    config: { rateLimit: writeLimit },
    schema: {
      response: {
        200: z.object({
          relayId: z.string(),
          pki: z.object({
            serverCertificate: z.string(),
            serverPrivateKey: z.string(),
            clientCertificateChain: z.string()
          }),
          ssh: z.object({
            serverCertificate: z.string(),
            serverPrivateKey: z.string(),
            clientCAPublicKey: z.string()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.RELAY_ACCESS_TOKEN]),
    handler: async (req) => {
      const certs = await server.services.relay.connectRelay({ relayId: req.permission.id });

      return {
        relayId: req.permission.id,
        ...certs
      };
    }
  });

  // ─── POST /heartbeat ──────────────────────────────────────────────────────
  server.route({
    method: "POST",
    url: "/heartbeat",
    config: { rateLimit: writeLimit },
    schema: {
      response: {
        200: z.object({ message: z.string() })
      }
    },
    onRequest: verifyAuth([AuthMode.RELAY_ACCESS_TOKEN]),
    handler: async (req) => {
      await server.services.relay.heartbeatRelay({ relayId: req.permission.id });
      return { message: "Successfully triggered heartbeat" };
    }
  });
};
