import { z } from "zod";

import { ProjectMembershipsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { authRateLimit } from "@app/server/config/rateLimiter";

export const registerProjectMembershipRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/:projectId/memberships",
    config: {
      rateLimit: authRateLimit
    },
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
};
