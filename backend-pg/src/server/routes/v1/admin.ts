import { z } from "zod";

import { ServerConfigSchema, UsersSchema } from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";
import { UnauthorizedError } from "@app/lib/errors";
import { verifySuperAdmin } from "@app/server/plugins/auth/superAdmin";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerAdminRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/config",
    method: "GET",
    schema: {
      response: {
        200: z.object({
          config: ServerConfigSchema
        })
      }
    },
    handler: () => {
      const config = server.services.serverCfg.getServerCfg();
      return { config };
    }
  });

  server.route({
    url: "/config",
    method: "PATCH",
    schema: {
      body: z.object({
        allowSignUp: z.boolean().optional()
      }),
      response: {
        200: z.object({
          config: ServerConfigSchema
        })
      }
    },
    preHandler: (req) => {
      verifyAuth([AuthMode.JWT, AuthMode.API_KEY])(req);
      verifySuperAdmin(req);
    },
    handler: async (req) => {
      const config = await server.services.serverCfg.updateServerCfg(req.body);
      return { config };
    }
  });

  server.route({
    url: "/signup",
    method: "POST",
    schema: {
      body: z.object({
        email: z.string().email().trim(),
        firstName: z.string().trim(),
        lastName: z.string().trim().optional(),
        protectedKey: z.string().trim(),
        protectedKeyIV: z.string().trim(),
        protectedKeyTag: z.string().trim(),
        publicKey: z.string().trim(),
        encryptedPrivateKey: z.string().trim(),
        encryptedPrivateKeyIV: z.string().trim(),
        encryptedPrivateKeyTag: z.string().trim(),
        salt: z.string().trim(),
        verifier: z.string().trim()
      }),
      response: {
        200: z.object({
          message: z.string(),
          user: UsersSchema,
          token: z.string()
        })
      }
    },
    handler: async (req, res) => {
      const appCfg = getConfig();
      const serverCfg = server.services.serverCfg.getServerCfg();
      if (serverCfg.initialized)
        throw new UnauthorizedError({ name: "Admin sign up", message: "Admin has been created" });
      const { user, token } = await server.services.serverCfg.adminSignUp({
        ...req.body,
        ip: req.realIp,
        userAgent: req.headers["user-agent"] || ""
      });

      res.setCookie("jid", token.refresh, {
        httpOnly: true,
        path: "/",
        sameSite: "strict",
        secure: appCfg.HTTPS_ENABLED
      });

      return {
        message: "Successfully set up admin account",
        user: user.user,
        token: token.access
      };
    }
  });
};
