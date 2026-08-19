import z from "zod";

import { AgentProxiesSchema } from "@app/db/schemas";
import { EventType, UserAgentType } from "@app/ee/services/audit-log/audit-log-types";
import { ResourceAuthMethodType } from "@app/ee/services/resource-auth-method/resource-auth-method-fns";
import { UnauthorizedError } from "@app/lib/errors";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { ActorType, AuthMode } from "@app/services/auth/auth-type";

const loginRateLimit = { windowMs: 60 * 1000, max: 10 };

// A bare hostname, optionally with a leading "*." wildcard label. No scheme, no path: these hosts pass
// through with no credential, so there is nothing to scope to a method or route.
const allowedHostSchema = z
  .string()
  .trim()
  .min(1)
  .max(253)
  .regex(
    /^(\*\.)?([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)*[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/,
    "Must be a hostname, optionally prefixed with '*.' (no scheme, port or path)"
  );

const allowedHostsSchema = z.array(allowedHostSchema).max(100);

const SanitizedAgentProxySchema = AgentProxiesSchema.pick({
  id: true,
  name: true,
  createdAt: true,
  updatedAt: true,
  heartbeat: true,
  allowedHosts: true
}).extend({
  canRevoke: z.boolean()
});

export const registerAgentProxyRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    config: { rateLimit: writeLimit },
    schema: {
      description: "Create an agent proxy.",
      operationId: "createAgentProxy",
      body: z.object({
        name: slugSchema({ min: 1, max: 32, field: "name" }).describe("A slug-friendly name for the agent proxy."),
        allowedHosts: allowedHostsSchema
          .optional()
          .describe("Hosts that pass through with no credential even when no policy covers them.")
      }),
      response: {
        200: z.object({ agentProxy: SanitizedAgentProxySchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const agentProxy = await server.services.agentProxy.createAgentProxy({
        name: req.body.name,
        allowedHosts: req.body.allowedHosts,
        actor: {
          type: req.permission.type,
          id: req.permission.id,
          orgId: req.permission.orgId,
          authMethod: req.permission.authMethod
        }
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.AGENT_PROXY_CREATE,
          metadata: { agentProxyId: agentProxy.id, name: agentProxy.name }
        }
      });

      const canRevoke = await server.services.resourceAuthMethod.canRevoke(agentProxy, "agentProxy");
      return { agentProxy: { ...agentProxy, canRevoke } };
    }
  });

  server.route({
    method: "GET",
    url: "/",
    config: { rateLimit: readLimit },
    schema: {
      description: "List the agent proxies in the organization.",
      operationId: "listAgentProxies",
      response: {
        200: z.object({ agentProxies: SanitizedAgentProxySchema.array() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const agentProxies = await server.services.agentProxy.listAgentProxies({
        actor: {
          type: req.permission.type,
          id: req.permission.id,
          orgId: req.permission.orgId,
          authMethod: req.permission.authMethod
        }
      });

      return {
        agentProxies: await Promise.all(
          agentProxies.map(async (agentProxy) => ({
            ...agentProxy,
            canRevoke: await server.services.resourceAuthMethod.canRevoke(agentProxy, "agentProxy")
          }))
        )
      };
    }
  });

  server.route({
    method: "GET",
    url: "/:agentProxyId",
    config: { rateLimit: readLimit },
    schema: {
      description: "Get an agent proxy by ID.",
      operationId: "getAgentProxyById",
      params: z.object({ agentProxyId: z.string().uuid() }),
      response: {
        200: z.object({ agentProxy: SanitizedAgentProxySchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const agentProxy = await server.services.agentProxy.getOrgAgentProxy({
        agentProxyId: req.params.agentProxyId,
        actor: {
          type: req.permission.type,
          id: req.permission.id,
          orgId: req.permission.orgId,
          authMethod: req.permission.authMethod
        }
      });

      const canRevoke = await server.services.resourceAuthMethod.canRevoke(agentProxy, "agentProxy");
      return { agentProxy: { ...agentProxy, canRevoke } };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:agentProxyId",
    config: { rateLimit: writeLimit },
    schema: {
      description: "Update an agent proxy.",
      operationId: "updateAgentProxy",
      params: z.object({ agentProxyId: z.string().uuid() }),
      body: z.object({
        name: slugSchema({ min: 1, max: 32, field: "name" }).optional(),
        allowedHosts: allowedHostsSchema.optional()
      }),
      response: {
        200: z.object({ agentProxy: SanitizedAgentProxySchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const agentProxy = await server.services.agentProxy.updateAgentProxy({
        agentProxyId: req.params.agentProxyId,
        name: req.body.name,
        allowedHosts: req.body.allowedHosts,
        actor: {
          type: req.permission.type,
          id: req.permission.id,
          orgId: req.permission.orgId,
          authMethod: req.permission.authMethod
        }
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.AGENT_PROXY_UPDATE,
          metadata: { agentProxyId: agentProxy.id, name: agentProxy.name }
        }
      });

      const canRevoke = await server.services.resourceAuthMethod.canRevoke(agentProxy, "agentProxy");
      return { agentProxy: { ...agentProxy, canRevoke } };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:agentProxyId",
    config: { rateLimit: writeLimit },
    schema: {
      description: "Delete an agent proxy.",
      operationId: "deleteAgentProxy",
      params: z.object({ agentProxyId: z.string().uuid() }),
      response: {
        200: z.object({ agentProxy: SanitizedAgentProxySchema.omit({ canRevoke: true }) })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const agentProxy = await server.services.agentProxy.deleteAgentProxy({
        agentProxyId: req.params.agentProxyId,
        actor: {
          type: req.permission.type,
          id: req.permission.id,
          orgId: req.permission.orgId,
          authMethod: req.permission.authMethod
        }
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.AGENT_PROXY_DELETE,
          metadata: { agentProxyId: agentProxy.id, name: agentProxy.name }
        }
      });

      return { agentProxy };
    }
  });

  server.route({
    method: "POST",
    url: "/:agentProxyId/token-auth/generate-enrollment-token",
    config: { rateLimit: writeLimit },
    schema: {
      description: "Generate a one-time enrollment token for an agent proxy.",
      operationId: "generateAgentProxyEnrollmentToken",
      params: z.object({ agentProxyId: z.string().uuid() }),
      response: {
        200: z.object({ token: z.string(), expiresAt: z.date() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const result = await server.services.resourceAuthMethod.mintToken({
        resource: { type: "agentProxy", id: req.params.agentProxyId },
        actor: req.permission
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.AGENT_PROXY_ENROLLMENT_TOKEN_CREATE,
          metadata: { tokenId: result.id, name: result.resourceName }
        }
      });

      return { token: result.token, expiresAt: result.expiresAt };
    }
  });

  server.route({
    method: "POST",
    url: "/:agentProxyId/revoke",
    config: { rateLimit: writeLimit },
    schema: {
      description: "Revoke an agent proxy's access token and any pending enrollment token.",
      operationId: "revokeAgentProxyAccess",
      params: z.object({ agentProxyId: z.string().uuid() }),
      response: {
        200: z.object({ method: z.string() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const result = await server.services.resourceAuthMethod.revokeAccess({
        resource: { type: "agentProxy", id: req.params.agentProxyId },
        actor: req.permission
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.RESOURCE_AUTH_METHOD_REVOKE,
          metadata: {
            resourceType: "agentProxy",
            resourceId: req.params.agentProxyId,
            method: result.method,
            resourceName: result.resourceName
          }
        }
      });

      return { method: result.method };
    }
  });

  server.route({
    method: "POST",
    url: "/login",
    config: { rateLimit: loginRateLimit },
    schema: {
      description: "Exchange an agent proxy enrollment token for an access token.",
      operationId: "loginAgentProxy",
      body: z.object({
        method: z.literal(ResourceAuthMethodType.Token),
        token: z.string().trim().min(1).max(256)
      }),
      response: {
        200: z.object({
          accessToken: z.string(),
          agentProxyId: z.string(),
          tokenType: z.literal("Bearer")
        })
      }
    },
    handler: async (req) => {
      const result = await server.services.resourceAuthMethod.loginWithToken({
        token: req.body.token,
        expectedResourceType: "agentProxy"
      });

      await server.services.auditLog
        .createAuditLog({
          orgId: result.orgId,
          actor: { type: ActorType.AGENT_PROXY, metadata: { agentProxyId: result.resourceId } },
          event: {
            type: EventType.RESOURCE_AUTH_METHOD_LOGIN,
            metadata: {
              resourceType: "agentProxy",
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
        agentProxyId: result.resourceId,
        tokenType: "Bearer" as const
      };
    }
  });

  server.route({
    method: "POST",
    url: "/heartbeat",
    config: { rateLimit: writeLimit },
    schema: {
      description: "Report that an agent proxy is alive.",
      operationId: "agentProxyHeartbeat",
      response: {
        200: z.object({ message: z.string() })
      }
    },
    onRequest: verifyAuth([AuthMode.AGENT_PROXY_ACCESS_TOKEN]),
    handler: async (req) => {
      if (req.permission.type !== ActorType.AGENT_PROXY) {
        throw new UnauthorizedError({ message: "Only an agent proxy can report a heartbeat" });
      }

      await server.services.agentProxy.heartbeat({ agentProxyId: req.permission.id });
      return { message: "Successfully registered heartbeat" };
    }
  });
};
