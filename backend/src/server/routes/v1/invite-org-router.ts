import { z } from "zod";

import { OrgMembershipRole, ProjectMembershipRole, UsersSchema } from "@app/db/schemas";
import { inviteUserRateLimit } from "@app/server/config/rateLimiter";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { ActorType, AuthMode } from "@app/services/auth/auth-type";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

export const registerInviteOrgRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/signup",
    config: {
      rateLimit: inviteUserRateLimit
    },
    method: "POST",
    schema: {
      body: z.object({
        inviteeEmails: z.array(z.string().trim().email()),
        organizationId: z.string().trim(),
        projectIds: z.array(z.string().trim()).optional(),
        projectRoleSlug: z.nativeEnum(ProjectMembershipRole).optional(),
        organizationRoleSlug: z.nativeEnum(OrgMembershipRole)
      }),
      response: {
        200: z.object({
          message: z.string(),
          completeInviteLinks: z
            .array(
              z.object({
                email: z.string(),
                link: z.string()
              })
            )
            .optional()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      if (req.auth.actor !== ActorType.USER) return;

      const completeInviteLinks = await server.services.org.inviteUserToOrganization({
        orgId: req.body.organizationId,
        userId: req.permission.id,
        inviteeEmails: req.body.inviteeEmails,
        projectIds: req.body.projectIds,
        projectRoleSlug: req.body.projectRoleSlug,
        organizationRoleSlug: req.body.organizationRoleSlug,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.UserOrgInvitation,
        distinctId: getTelemetryDistinctId(req),
        properties: {
          inviteeEmails: req.body.inviteeEmails,
          organizationRoleSlug: req.body.organizationRoleSlug,
          ...req.auditLogInfo
        }
      });

      return {
        completeInviteLinks,
        message: `Send an invite link to ${req.body.inviteeEmails.join(", ")}`
      };
    }
  });

  server.route({
    url: "/verify",
    method: "POST",
    config: {
      rateLimit: inviteUserRateLimit
    },
    schema: {
      body: z.object({
        email: z.string().trim().email(),
        organizationId: z.string().trim(),
        code: z.string().trim()
      }),
      response: {
        200: z.object({
          message: z.string(),
          token: z.string().optional(),
          user: UsersSchema
        })
      }
    },
    handler: async (req) => {
      const { user, token } = await server.services.org.verifyUserToOrg({
        orgId: req.body.organizationId,
        code: req.body.code,
        email: req.body.email
      });

      return {
        message: "Successfully verified email",
        user,
        token
      };
    }
  });
};
