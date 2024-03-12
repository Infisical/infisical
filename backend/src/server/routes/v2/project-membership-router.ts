import { z } from "zod";

import { ProjectMembershipsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { PROJECTS } from "@app/lib/api-docs";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerProjectMembershipRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/:projectId/memberships",
    schema: {
      params: z.object({
        projectId: z.string().describe(PROJECTS.INVITE_MEMBER.projectId)
      }),
      body: z.object({
        emails: z.string().email().array().default([]).describe(PROJECTS.INVITE_MEMBER.emails),
        usernames: z.string().array().default([]).describe(PROJECTS.INVITE_MEMBER.usernames)
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
        actorAuthMethod: req.permission.authMethod,
        actorId: req.permission.id,
        actor: req.permission.type,
        emails: req.body.emails,
        usernames: req.body.usernames
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
        projectId: z.string().describe(PROJECTS.REMOVE_MEMBER.projectId)
      }),

      body: z.object({
        emails: z.string().email().array().default([]).describe(PROJECTS.REMOVE_MEMBER.emails),
        usernames: z.string().array().default([]).describe(PROJECTS.REMOVE_MEMBER.usernames)
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
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.params.projectId,
        emails: req.body.emails,
        usernames: req.body.usernames
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
