import { z } from "zod";

import { UserSchema } from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";

export const registerSignupRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/email/signup",
    method: "POST",
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
    schema: {
      body: z.object({
        email: z.string().email().trim(),
        code: z.string().trim()
      }),
      response: {
        200: z.object({
          message: z.string(),
          token: z.string(),
          user: UserSchema
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
        organizationName: z.string().trim(),
        providerAuthToken: z.string().trim().optional().nullish(),
        attributionSource: z.string().trim().optional()
      }),
      response: {
        200: z.object({
          message: z.string(),
          user: UserSchema,
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
