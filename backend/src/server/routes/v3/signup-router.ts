import { z } from "zod";

import { UsersSchema } from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";
import { ForbiddenRequestError } from "@app/lib/errors";
import { authRateLimit } from "@app/server/config/rateLimiter";
import { GenericResourceNameSchema } from "@app/server/lib/schemas";
import { getServerCfg } from "@app/services/super-admin/super-admin-service";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

export const registerSignupRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/email/signup",
    method: "POST",
    config: {
      rateLimit: authRateLimit
    },
    schema: {
      body: z.object({
        email: z.string().email().trim()
      }),
      response: {
        200: z.object({
          message: z.string()
        })
      }
    },
    handler: async (req) => {
      const { email } = req.body;

      const serverCfg = await getServerCfg();
      if (!serverCfg.allowSignUp) {
        throw new ForbiddenRequestError({
          message: "Signup's are disabled"
        });
      }

      if (serverCfg?.allowedSignUpDomain) {
        const domain = email.split("@")[1];
        const allowedDomains = serverCfg.allowedSignUpDomain.split(",").map((e) => e.trim());
        if (!allowedDomains.includes(domain)) {
          throw new ForbiddenRequestError({
            message: `Email with a domain (@${domain}) is not supported`
          });
        }
      }
      await server.services.signup.beginEmailSignupProcess(email);
      return { message: `Sent an email verification code to ${email}` };
    }
  });

  server.route({
    url: "/email/verify",
    method: "POST",
    config: {
      rateLimit: authRateLimit
    },
    schema: {
      body: z.object({
        email: z.string().email().trim(),
        code: z.string().trim()
      }),
      response: {
        200: z.object({
          message: z.string(),
          token: z.string(),
          user: UsersSchema
        })
      }
    },
    handler: async (req) => {
      const serverCfg = await getServerCfg();
      if (!serverCfg.allowSignUp) {
        throw new ForbiddenRequestError({
          message: "Signup's are disabled"
        });
      }

      const { token, user } = await server.services.signup.verifyEmailSignup(req.body.email, req.body.code);
      return { message: "Successfully verified email", token, user };
    }
  });

  server.route({
    url: "/complete-account/signup",
    method: "POST",
    config: {
      rateLimit: authRateLimit
    },
    schema: {
      body: z
        .object({
          email: z.string().trim(),
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
          verifier: z.string().trim(),
          providerAuthToken: z.string().trim().optional().nullish(),
          attributionSource: z.string().trim().optional(),
          password: z.string()
        })
        .and(
          z.preprocess(
            (data) => {
              if (typeof data === "object" && data && "useDefaultOrg" in data === false) {
                return { ...data, useDefaultOrg: false };
              }
              return data;
            },
            z.discriminatedUnion("useDefaultOrg", [
              z.object({ useDefaultOrg: z.literal(true) }),
              z.object({
                useDefaultOrg: z.literal(false),
                organizationName: GenericResourceNameSchema
              })
            ])
          )
        ),
      response: {
        200: z.object({
          message: z.string(),
          user: UsersSchema,
          token: z.string(),
          organizationId: z.string().nullish()
        })
      }
    },
    handler: async (req, res) => {
      const userAgent = req.headers["user-agent"];
      if (!userAgent) throw new Error("user agent header is required");
      const appCfg = getConfig();

      const { user, accessToken, refreshToken, organizationId } =
        await server.services.signup.completeEmailAccountSignup({
          ...req.body,
          ip: req.realIp,
          userAgent,
          authorization: req.headers.authorization as string
        });

      if (user.email) {
        void server.services.telemetry.sendLoopsEvent(user.email, user.firstName || "", user.lastName || "");
      }

      void server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.UserSignedUp,
        distinctId: user.username ?? "",
        properties: {
          username: user.username,
          email: user.email ?? "",
          attributionSource: req.body.attributionSource
        }
      });

      void res.setCookie("jid", refreshToken, {
        httpOnly: true,
        path: "/",
        sameSite: "strict",
        secure: appCfg.HTTPS_ENABLED
      });

      return { message: "Successfully set up account", user, token: accessToken, organizationId };
    }
  });

  server.route({
    url: "/complete-account/invite",
    method: "POST",
    config: {
      rateLimit: authRateLimit
    },
    schema: {
      body: z.object({
        email: z.string().email().trim(),
        password: z.string(),
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
        verifier: z.string().trim(),
        tokenMetadata: z.string().optional()
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
      const userAgent = req.headers["user-agent"];
      if (!userAgent) throw new Error("user agent header is required");
      const appCfg = getConfig();

      const { user, accessToken, refreshToken } = await server.services.signup.completeAccountInvite({
        ...req.body,
        ip: req.realIp,
        userAgent,
        authorization: req.headers.authorization as string
      });

      if (user.email) {
        void server.services.telemetry.sendLoopsEvent(user.email, user.firstName || "", user.lastName || "");
      }

      void server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.UserSignedUp,
        distinctId: user.username ?? "",
        properties: {
          username: user.username,
          email: user.email ?? "",
          attributionSource: "Team Invite"
        }
      });

      void res.setCookie("jid", refreshToken, {
        httpOnly: true,
        path: "/",
        sameSite: "strict",
        secure: appCfg.HTTPS_ENABLED
      });
      // TODO(akhilmhdh-pg): add telemetry service

      return { message: "Successfully set up account", user, token: accessToken };
    }
  });
};
