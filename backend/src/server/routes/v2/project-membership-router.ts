import { z } from "zod";

import { ProjectMembershipsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerProjectMembershipRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/:projectId/memberships",
    schema: {
      params: z.object({
        projectId: z.string()
      }),
      body: z.object({
        emails: z.string().email().array()
      }),
      response: {
        200: z.object({
          memberships: ProjectMembershipsSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const memberships = await server.services.projectMembership.addUsersToProjectNonE2EE({
        projectId: req.params.projectId,
        actorId: req.permission.id,
        actor: req.permission.type,
        emails: req.body.emails
      });

      await server.services.auditLog.createAuditLog({
        projectId: req.params.projectId,
        ...req.auditLogInfo,
        event: {
          type: EventType.ADD_BATCH_WORKSPACE_MEMBER,
          metadata: memberships.map(({ userId, id }) => ({
            userId: userId || "",
            membershipId: id,
            email: ""
          }))
        }
      });

      return { memberships };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:projectId/memberships",
    schema: {
      params: z.object({
        projectId: z.string()
      }),

      body: z.object({
        emails: z.string().email().array()
      }),
      response: {
        200: z.object({
          memberships: ProjectMembershipsSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const memberships = await server.services.projectMembership.deleteProjectMemberships({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        projectId: req.params.projectId,
        emails: req.body.emails
      });

      for (const membership of memberships) {
        // eslint-disable-next-line no-await-in-loop
        await server.services.auditLog.createAuditLog({
          ...req.auditLogInfo,
          projectId: req.params.projectId,
          event: {
            type: EventType.REMOVE_WORKSPACE_MEMBER,
            metadata: {
              userId: membership.userId,
              email: ""
            }
          }
        });
      }
      return { memberships };
    }
  });
};
