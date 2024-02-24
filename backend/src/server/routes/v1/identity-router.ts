import { z } from "zod";

import { IdentitiesSchema, OrgMembershipRole } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

export const registerIdentityRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Create identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      body: z.object({
        name: z.string().trim(),
        organizationId: z.string().trim(),
        role: z.string().trim().min(1).default(OrgMembershipRole.NoAccess)
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

      server.services.telemetry.sendPostHogEvents({
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
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Update identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string()
      }),
      body: z.object({
        name: z.string().trim().optional(),
        role: z.string().trim().min(1).optional()
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
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Delete identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string()
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
};
