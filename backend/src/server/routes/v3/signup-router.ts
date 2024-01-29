import { z } from "zod";

import { UsersSchema } from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";
import { authRateLimit } from "@app/server/config/rateLimiter";
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
      await server.services.signup.beginEmailSignupProcess(req.body.email);
      return { message: `Sent an email verification code to ${req.body.email}` };
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
      const { token, user } = await server.services.signup.verifyEmailSignup(
        req.body.email,
        req.body.code
      );
      return { message: "Successfuly verified email", token, user };
    }
  });

  server.route({
    url: "/complete-account/signup",
    method: "POST",
    config: {
      rateLimit: authRateLimit
    },
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
        verifier: z.string().trim(),
        organizationName: z.string().trim().min(1),
        providerAuthToken: z.string().trim().optional().nullish(),
        attributionSource: z.string().trim().optional()
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

      const { user, accessToken, refreshToken } =
        await server.services.signup.completeEmailAccountSignup({
          ...req.body,
          ip: req.realIp,
          userAgent,
          authorization: req.headers.authorization as string
        });

      server.services.telemetry.sendLoopsEvent(
        user.email,
        user.firstName || "",
        user.lastName || ""
      );

      server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.UserSignedUp,
        distinctId: user.email,
        properties: {
          email: user.email,
          attributionSource: req.body.attributionSource
        }
      });

      res.setCookie("jid", refreshToken, {
        httpOnly: true,
        path: "/",
        sameSite: "strict",
        secure: appCfg.HTTPS_ENABLED
      });

      return { message: "Successfully set up account", user, token: accessToken };
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
      const userAgent = req.headers["user-agent"];
      if (!userAgent) throw new Error("user agent header is required");
      const appCfg = getConfig();

      const { user, accessToken, refreshToken } =
        await server.services.signup.completeAccountInvite({
          ...req.body,
          ip: req.realIp,
          userAgent
        });

      res.setCookie("jid", refreshToken, {
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
