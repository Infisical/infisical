import { z } from "zod";

import { getConfig } from "@app/lib/config/env";
import { ForbiddenRequestError } from "@app/lib/errors";
import { authRateLimit, smtpRateLimit } from "@app/server/config/rateLimiter";
import { addAuthOriginDomainCookie } from "@app/server/lib/cookie";
import { GenericResourceNameSchema } from "@app/server/lib/schemas";
import { CompleteAccountType } from "@app/services/auth/auth-signup-type";
import { getServerCfg } from "@app/services/super-admin/super-admin-service";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

import { SanitizedUserSchema } from "../sanitizedSchemas";

export const registerSignupRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/email/signup",
    method: "POST",
    config: {
      rateLimit: smtpRateLimit({
        keyGenerator: (req) => (req.body as { email?: string })?.email?.trim().substring(0, 100) || req.realIp
      })
    },
    schema: {
      operationId: "beginEmailSignupV3",
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
      rateLimit: smtpRateLimit({
        keyGenerator: (req) => (req.body as { email?: string })?.email?.trim().substring(0, 100) || req.realIp
      })
    },
    schema: {
      operationId: "verifyEmailSignupV3",
      body: z.object({
        email: z.string().email().trim(),
        code: z.string().trim()
      }),
      response: {
        200: z.object({
          message: z.string(),
          token: z.string(),
          user: SanitizedUserSchema
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
    url: "/complete-account",
    method: "POST",
    config: {
      rateLimit: authRateLimit
    },
    schema: {
      operationId: "completeAccountSignupV3",
      body: z.discriminatedUnion("type", [
        z.object({
          type: z.literal(CompleteAccountType.Email),
          email: z.string().trim(),
          firstName: z.string().trim(),
          lastName: z.string().trim().optional(),
          attributionSource: z.string().trim().optional(),
          password: z.string(),
          organizationName: GenericResourceNameSchema.optional()
        }),
        z.object({
          type: z.literal(CompleteAccountType.Alias),
          code: z.string().trim()
        })
      ]),
      response: {
        200: z.object({
          message: z.string(),
          user: SanitizedUserSchema,
          token: z.string()
        })
      }
    },
    handler: async (req, res) => {
      const userAgent = req.headers["user-agent"];
      if (!userAgent) throw new Error("user agent header is required");
      const appCfg = getConfig();

      const { user, accessToken, refreshToken, authMethod, organizationId } =
        await server.services.signup.completeAccount({
          ...req.body,
          ip: req.realIp,
          userAgent,
          authorization: req.headers.authorization as string
        });

      if (user.email) {
        void server.services.telemetry.sendLoopsEvent(user.email, user.firstName || "", user.lastName || "");
        void server.services.telemetry.sendHubSpotSignupEvent(
          user.email,
          authMethod,
          user.firstName || "",
          user.lastName || ""
        );
      }

      void server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.UserSignedUp,
        distinctId: user.username ?? "",
        ...(organizationId ? { organizationId } : {}),
        properties: {
          username: user.username,
          email: user.email ?? "",
          attributionSource: "attributionSource" in req.body ? req.body.attributionSource : undefined
        }
      });

      const signupDistinctId = user.username ?? user.email ?? "";
      if (signupDistinctId) {
        void server.services.telemetry.identifyUser(
          signupDistinctId,
          {
            email: user.email ?? undefined,
            username: user.username,
            userId: user.id,
            firstName: user.firstName ?? undefined,
            lastName: user.lastName ?? undefined,
            isEmailVerified: user.isEmailVerified ?? undefined,
            isMfaEnabled: user.isMfaEnabled ?? undefined,
            superAdmin: user.superAdmin ?? undefined
          },
          { skipDedup: true }
        );
      }

      void res.setCookie("jid", refreshToken, {
        httpOnly: true,
        path: "/api",
        sameSite: "strict",
        secure: appCfg.HTTPS_ENABLED
      });

      addAuthOriginDomainCookie(res);

      return { message: "Successfully set up account", user, token: accessToken };
    }
  });
};
