import { z } from "zod";

import { UsersSchema } from "@app/db/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { ActorType, AuthMode } from "@app/services/auth/auth-type";

export const registerInviteOrgRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/signup",
    method: "POST",
    schema: {
      body: z.object({
        inviteeEmail: z.string().trim().email(),
        organizationId: z.string().trim()
      }),
      response: {
        200: z.object({
          message: z.string(),
          completeInviteLink: z.string().optional()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      if (req.auth.actor !== ActorType.USER) return;
      const completeInviteLink = await server.services.org.inviteUserToOrganization({
        orgId: req.body.organizationId,
        userId: req.permission.id,
        inviteeEmail: req.body.inviteeEmail
      });

      return {
        completeInviteLink,
        message: `Send an invite link to ${req.body.inviteeEmail}`
      };
    }
  });

  server.route({
    url: "/verify",
    method: "POST",
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
