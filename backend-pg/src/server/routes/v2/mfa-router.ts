import jwt, { JwtPayload } from "jsonwebtoken";
import { z } from "zod";

import { getConfig } from "@app/lib/config/env";
import { AuthTokenType } from "@app/services/auth/auth-type";

export const registerMfaRouter = async (server: FastifyZodProvider) => {
  const cfg = getConfig();

  server.decorateRequest("mfa", null);
  server.addHook("preParsing", async (req, res) => {
    const authorizationHeader = req.headers.authorization;

    if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) {
      res.status(401).send({ error: "Missing bearer token" });
      return res;
    }
    const token = authorizationHeader.split(" ")[1];
    if (!token) {
      res.status(401).send({ error: "Missing bearer token" });
      return res;
    }

    const decodedToken = jwt.verify(token, cfg.JWT_AUTH_SECRET) as JwtPayload;
    if (decodedToken.authTokenType !== AuthTokenType.MFA_TOKEN)
      throw new Error("Unauthorized access");

    const user = await server.store.user.findById(decodedToken.userId);
    if (!user) throw new Error("User not found");
    req.mfa = { userId: user.id, user };
  });

  server.route({
    url: "/mfa/send",
    method: "POST",
    schema: {
      response: {
        200: z.object({
          message: z.string()
        })
      }
    },
    handler: async (req) => {
      await server.services.login.resendMfaToken(req.mfa.userId);
      return { message: "Successfully send new mfa code" };
    }
  });

  server.route({
    url: "/mfa/verify",
    method: "POST",
    schema: {
      body: z.object({
        mfaToken: z.string().trim()
      }),
      response: {
        200: z.object({
          encryptionVersion: z.number().default(1).nullable().optional(),
          protectedKey: z.string().nullable(),
          protectedKeyIV: z.string().nullable(),
          protectedKeyTag: z.string().nullable(),
          publicKey: z.string(),
          encryptedPrivateKey: z.string(),
          iv: z.string(),
          tag: z.string(),
          token: z.string()
        })
      }
    },
    handler: async (req, res) => {
      const userAgent = req.headers["user-agent"];
      if (!userAgent) throw new Error("user agent header is required");
      const appCfg = getConfig();

      const { user, token } = await server.services.login.verifyMfaToken({
        userAgent,
        ip: req.realIp,
        userId: req.mfa.userId,
        mfaToken: req.body.mfaToken
      });

      res.setCookie("jid", token.refresh, {
        httpOnly: true,
        path: "/",
        sameSite: "strict",
        secure: appCfg.HTTPS_ENABLED
      });

      return { token: token.access, ...user };
    }
  });
};
