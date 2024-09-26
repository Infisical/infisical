import { z } from "zod";

import { OrganizationsSchema, SuperAdminSchema, UsersSchema } from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifySuperAdmin } from "@app/server/plugins/auth/superAdmin";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { getServerCfg } from "@app/services/super-admin/super-admin-service";
import { LoginMethod } from "@app/services/super-admin/super-admin-types";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

export const registerAdminRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/config",
    config: {
      rateLimit: readLimit
    },
    schema: {
      response: {
        200: z.object({
          config: SuperAdminSchema.omit({
            createdAt: true,
            updatedAt: true,
            encryptedSlackClientId: true,
            encryptedSlackClientSecret: true
          }).extend({
            isMigrationModeOn: z.boolean(),
            defaultAuthOrgSlug: z.string().nullable(),
            isSecretScanningDisabled: z.boolean()
          })
        })
      }
    },
    handler: async () => {
      const config = await getServerCfg();
      const serverEnvs = getConfig();
      return {
        config: {
          ...config,
          isMigrationModeOn: serverEnvs.MAINTENANCE_MODE,
          isSecretScanningDisabled: serverEnvs.DISABLE_SECRET_SCANNING
        }
      };
    }
  });

  server.route({
    method: "PATCH",
    url: "/config",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      body: z.object({
        allowSignUp: z.boolean().optional(),
        allowedSignUpDomain: z.string().optional().nullable(),
        trustSamlEmails: z.boolean().optional(),
        trustLdapEmails: z.boolean().optional(),
        trustOidcEmails: z.boolean().optional(),
        defaultAuthOrgId: z.string().optional().nullable(),
        enabledLoginMethods: z
          .nativeEnum(LoginMethod)
          .array()
          .optional()
          .refine((methods) => !methods || methods.length > 0, {
            message: "At least one login method should be enabled."
          }),
        slackClientId: z.string().optional(),
        slackClientSecret: z.string().optional()
      }),
      response: {
        200: z.object({
          config: SuperAdminSchema.extend({
            defaultAuthOrgSlug: z.string().nullable()
          })
        })
      }
    },
    onRequest: (req, res, done) => {
      verifyAuth([AuthMode.JWT, AuthMode.API_KEY])(req, res, () => {
        verifySuperAdmin(req, res, done);
      });
    },
    handler: async (req) => {
      const config = await server.services.superAdmin.updateServerCfg(req.body, req.permission.id);
      return { config };
    }
  });

  server.route({
    method: "GET",
    url: "/user-management/users",
    config: {
      rateLimit: readLimit
    },
    schema: {
      querystring: z.object({
        searchTerm: z.string().default(""),
        offset: z.coerce.number().default(0),
        limit: z.coerce.number().max(100).default(20)
      }),
      response: {
        200: z.object({
          users: UsersSchema.pick({
            username: true,
            firstName: true,
            lastName: true,
            email: true,
            id: true
          }).array()
        })
      }
    },
    onRequest: (req, res, done) => {
      verifyAuth([AuthMode.JWT])(req, res, () => {
        verifySuperAdmin(req, res, done);
      });
    },
    handler: async (req) => {
      const users = await server.services.superAdmin.getUsers({
        ...req.query
      });

      return {
        users
      };
    }
  });

  server.route({
    method: "GET",
    url: "/integrations/slack/config",
    config: {
      rateLimit: readLimit
    },
    schema: {
      response: {
        200: z.object({
          clientId: z.string(),
          clientSecret: z.string()
        })
      }
    },
    onRequest: (req, res, done) => {
      verifyAuth([AuthMode.JWT])(req, res, () => {
        verifySuperAdmin(req, res, done);
      });
    },
    handler: async () => {
      const adminSlackConfig = await server.services.superAdmin.getAdminSlackConfig();

      return adminSlackConfig;
    }
  });

  server.route({
    method: "DELETE",
    url: "/user-management/users/:userId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        userId: z.string()
      }),
      response: {
        200: z.object({
          users: UsersSchema.pick({
            username: true,
            firstName: true,
            lastName: true,
            email: true,
            id: true
          })
        })
      }
    },
    onRequest: (req, res, done) => {
      verifyAuth([AuthMode.JWT])(req, res, () => {
        verifySuperAdmin(req, res, done);
      });
    },
    handler: async (req) => {
      const users = await server.services.superAdmin.deleteUser(req.params.userId);

      return {
        users
      };
    }
  });

  server.route({
    method: "POST",
    url: "/signup",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      body: z.object({
        email: z.string().email().trim(),
        password: z.string().trim(),
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
          organization: OrganizationsSchema,
          token: z.string(),
          new: z.string()
        })
      }
    },
    handler: async (req, res) => {
      const appCfg = getConfig();
      const serverCfg = await getServerCfg();
      if (serverCfg.initialized) throw new BadRequestError({ message: "Admin account has already been set up" });
      const { user, token, organization } = await server.services.superAdmin.adminSignUp({
        ...req.body,
        ip: req.realIp,
        userAgent: req.headers["user-agent"] || ""
      });

      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.AdminInit,
        distinctId: user.user.username ?? "",
        properties: {
          username: user.user.username,
          email: user.user.email ?? "",
          lastName: user.user.lastName || "",
          firstName: user.user.firstName || ""
        }
      });

      void res.setCookie("jid", token.refresh, {
        httpOnly: true,
        path: "/",
        sameSite: "strict",
        secure: appCfg.HTTPS_ENABLED
      });

      return {
        message: "Successfully set up admin account",
        user: user.user,
        token: token.access,
        organization,
        new: "123"
      };
    }
  });
};
