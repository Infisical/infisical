import { z } from "zod";

import { IdentitiesSchema, IdentityOrgMembershipsSchema, OrgMembershipRole, OrgRolesSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { IDENTITIES } from "@app/lib/api-docs";
import { creationLimit, readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

export const registerIdentityRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: creationLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Create identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      body: z.object({
        name: z.string().trim().describe(IDENTITIES.CREATE.name),
        organizationId: z.string().trim().describe(IDENTITIES.CREATE.organizationId),
        role: z.string().trim().min(1).default(OrgMembershipRole.NoAccess).describe(IDENTITIES.CREATE.role)
      }),
      response: {
        200: z.object({
          identity: IdentitiesSchema
        })
      }
    },
    handler: async (req) => {
      const identity = await server.services.identity.createIdentity({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body,
        orgId: req.body.organizationId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.body.organizationId,
        event: {
          type: EventType.CREATE_IDENTITY,
          metadata: {
            name: identity.name,
            identityId: identity.id
          }
        }
      });

      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.MachineIdentityCreated,
        distinctId: getTelemetryDistinctId(req),
        properties: {
          orgId: req.body.organizationId,
          name: identity.name,
          identityId: identity.id,
          ...req.auditLogInfo
        }
      });

      return { identity };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Update identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().describe(IDENTITIES.UPDATE.identityId)
      }),
      body: z.object({
        name: z.string().trim().optional().describe(IDENTITIES.UPDATE.name),
        role: z.string().trim().min(1).optional().describe(IDENTITIES.UPDATE.role)
      }),
      response: {
        200: z.object({
          identity: IdentitiesSchema
        })
      }
    },
    handler: async (req) => {
      const identity = await server.services.identity.updateIdentity({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: req.params.identityId,
        ...req.body
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identity.orgId,
        event: {
          type: EventType.UPDATE_IDENTITY,
          metadata: {
            name: identity.name,
            identityId: identity.id
          }
        }
      });

      return { identity };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Delete identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().describe(IDENTITIES.DELETE.identityId)
      }),
      response: {
        200: z.object({
          identity: IdentitiesSchema
        })
      }
    },
    handler: async (req) => {
      const identity = await server.services.identity.deleteIdentity({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: req.params.identityId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identity.orgId,
        event: {
          type: EventType.DELETE_IDENTITY,
          metadata: {
            identityId: identity.id
          }
        }
      });
      return { identity };
    }
  });

  server.route({
    method: "GET",
    url: "/:identityId",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Get an identity by id",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().describe(IDENTITIES.GET_BY_ID.identityId)
      }),
      response: {
        200: z.object({
          identity: IdentityOrgMembershipsSchema.extend({
            customRole: OrgRolesSchema.pick({
              id: true,
              name: true,
              slug: true,
              permissions: true,
              description: true
            }).optional(),
            identity: IdentitiesSchema.pick({ name: true, id: true, authMethod: true })
          })
        })
      }
    },
    handler: async (req) => {
      const identity = await server.services.identity.getIdentityById({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: req.params.identityId
      });

      return { identity };
    }
  });

  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "List identities",
      security: [
        {
          bearerAuth: []
        }
      ],
      querystring: z.object({
        orgId: z.string().describe(IDENTITIES.LIST.orgId)
      }),
      response: {
        200: z.object({
          identities: IdentityOrgMembershipsSchema.extend({
            customRole: OrgRolesSchema.pick({
              id: true,
              name: true,
              slug: true,
              permissions: true,
              description: true
            }).optional(),
            identity: IdentitiesSchema.pick({ name: true, id: true, authMethod: true })
          }).array()
        })
      }
    },
    handler: async (req) => {
      const identities = await server.services.identity.listOrgIdentities({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        orgId: req.query.orgId
      });

      return { identities };
    }
  });
};
