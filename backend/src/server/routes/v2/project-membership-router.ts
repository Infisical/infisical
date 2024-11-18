import { z } from "zod";

import { OrgMembershipRole, ProjectMembershipRole, ProjectMembershipsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { PROJECT_USERS } from "@app/lib/api-docs";
import { writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerProjectMembershipRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/:projectId/memberships",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Invite members to project",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        projectId: z.string().describe(PROJECT_USERS.INVITE_MEMBER.projectId)
      }),
      body: z.object({
        emails: z.string().email().array().default([]).describe(PROJECT_USERS.INVITE_MEMBER.emails),
        usernames: z.string().array().default([]).describe(PROJECT_USERS.INVITE_MEMBER.usernames),
        roleSlugs: z.string().array().optional().describe(PROJECT_USERS.INVITE_MEMBER.roleSlugs)
      }),
      response: {
        200: z.object({
          memberships: ProjectMembershipsSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const usernamesAndEmails = [...req.body.emails, ...req.body.usernames];
      const { projectMemberships: memberships } = await server.services.org.inviteUserToOrganization({
        actorAuthMethod: req.permission.authMethod,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actor: req.permission.type,
        inviteeEmails: usernamesAndEmails,
        orgId: req.permission.orgId,
        organizationRoleSlug: OrgMembershipRole.NoAccess,
        projects: [
          {
            id: req.params.projectId,
            projectRoleSlug: [ProjectMembershipRole.Member]
          }
        ]
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
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Remove members from project",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        projectId: z.string().describe(PROJECT_USERS.REMOVE_MEMBER.projectId)
      }),
      body: z.object({
        emails: z.string().email().array().default([]).describe(PROJECT_USERS.REMOVE_MEMBER.emails),
        usernames: z.string().array().default([]).describe(PROJECT_USERS.REMOVE_MEMBER.usernames)
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
