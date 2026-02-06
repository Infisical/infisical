import { z } from "zod";

import { AccessScope, OrgMembershipRole, UsersSchema } from "@app/db/schemas";
import { inviteUserRateLimit, smtpRateLimit } from "@app/server/config/rateLimiter";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { ActorType, AuthMode } from "@app/services/auth/auth-type";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

export const registerInviteOrgRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/signup",
    config: {
      rateLimit: smtpRateLimit()
    },
    method: "POST",
    schema: {
      operationId: "inviteUsersToOrganization",
      body: z.object({
        inviteeEmails: z
          .string()
          .trim()
          .email()
          .array()
          .refine((val) => val.every((el) => el === el.toLowerCase()), "Email must be lowercase"),
        organizationId: z.string().trim(),
        organizationRoleSlug: z.string().default(OrgMembershipRole.Member)
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

      const { signUpTokens: completeInviteLinks } = await server.services.membershipUser.createMembership({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Organization,
          orgId: req.permission.orgId
        },
        data: {
          usernames: req.body.inviteeEmails,
          roles: [{ isTemporary: false, role: req.body.organizationRoleSlug }]
        }
      });

      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.UserOrgInvitation,
        distinctId: getTelemetryDistinctId(req),
        organizationId: req.permission.orgId,
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
    url: "/signup-resend",
    config: {
      rateLimit: smtpRateLimit({
        keyGenerator: (req) =>
          (req.body as { membershipId?: string })?.membershipId?.trim().substring(0, 100) || req.realIp
      })
    },
    method: "POST",
    schema: {
      operationId: "resendOrganizationMemberInvitation",
      body: z.object({
        membershipId: z.string()
      }),
      response: {
        200: z.object({
          signupToken: z
            .object({
              email: z.string(),
              link: z.string()
            })
            .optional()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      return server.services.org.resendOrgMemberInvitation({
        orgId: req.permission.orgId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        membershipId: req.body.membershipId
      });
    }
  });

  server.route({
    url: "/verify",
    method: "POST",
    config: {
      rateLimit: inviteUserRateLimit
    },
    schema: {
      operationId: "verifyUserToOrganization",
      body: z.object({
        email: z
          .string()
          .trim()
          .email()
          .refine((val) => val === val.toLowerCase(), "Email must be lowercase"),
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
