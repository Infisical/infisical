import { z } from "zod";

import { AccessScope, OrgMembershipRole, ProjectMembershipRole, ProjectMembershipsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags, PROJECT_USERS } from "@app/lib/api-docs";
import { ForbiddenRequestError, PermissionBoundaryError } from "@app/lib/errors";
import { ORG_AUTH_ENFORCED_ERROR_MESSAGE } from "@app/services/membership-user/membership-user-types";
import { writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerDeprecatedProjectMembershipRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/:projectId/memberships",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.ProjectUsers],
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
        emails: z
          .string()
          .email()
          .array()
          .default([])
          .describe(PROJECT_USERS.INVITE_MEMBER.emails)
          .refine((val) => val.every((el) => el === el.toLowerCase()), "Email must be lowercase"),
        usernames: z
          .string()
          .array()
          .default([])
          .describe(PROJECT_USERS.INVITE_MEMBER.usernames)
          .refine((val) => val.every((el) => el === el.toLowerCase()), "Username must be lowercase"),
        roleSlugs: z.string().array().min(1).optional().describe(PROJECT_USERS.INVITE_MEMBER.roleSlugs)
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

      try {
        await server.services.membershipUser.createMembership({
          permission: req.permission,
          scopeData: {
            scope: AccessScope.Organization,
            orgId: req.permission.orgId
          },
          data: {
            roles: [{ isTemporary: false, role: OrgMembershipRole.NoAccess }],
            usernames: usernamesAndEmails
          }
        });
      } catch (error) {
        // When org-level auth is enforced (e.g. SSO/SAML), creating new org memberships
        // is blocked. If the users are already org members, we can safely proceed to add
        // them to the project — the project membership guard will verify org membership.
        // If they are NOT org members, the project membership creation will fail with
        // a clear "Users not part of organization" error.
        //
        // We only swallow ForbiddenRequestError that is NOT a PermissionBoundaryError
        // (which extends ForbiddenRequestError) and only when the message matches the
        // specific auth-enforcement error. All other errors are re-thrown.
        const isAuthEnforcedError =
          error instanceof ForbiddenRequestError &&
          !(error instanceof PermissionBoundaryError) &&
          error.message === ORG_AUTH_ENFORCED_ERROR_MESSAGE;

        if (!isAuthEnforcedError) {
          throw error;
        }
      }

      const { memberships } = await server.services.membershipUser.createMembership({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Project,
          orgId: req.permission.orgId,
          projectId: req.params.projectId
        },
        data: {
          usernames: usernamesAndEmails,
          roles: (req.body.roleSlugs || [ProjectMembershipRole.Member]).map((role) => ({ isTemporary: false, role }))
        }
      });

      await server.services.auditLog.createAuditLog({
        projectId: req.params.projectId,
        ...req.auditLogInfo,
        event: {
          type: EventType.ADD_BATCH_PROJECT_MEMBER,
          metadata: {
            members: memberships.map(({ actorUserId, id }) => ({
              userId: actorUserId || "",
              membershipId: id,
              email: ""
            }))
          }
        }
      });

      return {
        memberships: memberships.map((el) => ({
          ...el,
          userId: el.actorUserId as string,
          projectId: req.params.projectId
        }))
      };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:projectId/memberships",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.ProjectUsers],
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
        emails: z
          .string()
          .email()
          .array()
          .default([])
          .describe(PROJECT_USERS.REMOVE_MEMBER.emails)
          .refine((val) => val.every((el) => el === el.toLowerCase()), "Email must be lowercase"),
        usernames: z
          .string()
          .array()
          .default([])
          .describe(PROJECT_USERS.REMOVE_MEMBER.usernames)
          .refine((val) => val.every((el) => el === el.toLowerCase()), "Username must be lowercase")
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
            type: EventType.REMOVE_PROJECT_MEMBER,
            metadata: {
              userId: membership.actorUserId as string,
              email: ""
            }
          }
        });
      }
      return {
        memberships: memberships.map((el) => ({
          ...el,
          userId: el.actorUserId as string,
          projectId: req.params.projectId
        }))
      };
    }
  });
};
