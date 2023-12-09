import { FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import jwt, { JwtPayload } from "jsonwebtoken";

import { getConfig } from "@app/lib/config/env";
import { UnauthorizedError } from "@app/lib/errors";
import { AuthMode, AuthModeJwtTokenPayload, AuthTokenType } from "@app/services/auth/auth-type";

const extractAuth = async (req: FastifyRequest, jwtSecret: string) => {
  const apiKey = req.headers?.["x-api-key"];
  if (apiKey) {
    return { authMode: AuthMode.API_KEY, token: apiKey };
  }
  const authHeader = req.headers?.authorization;
  if (!authHeader) return { authMode: null, token: null };

  const authTokenValue = authHeader.slice(7); // slice of after Bearer
  if (authTokenValue.startsWith("st.")) {
    return { authMode: AuthMode.SERVICE_TOKEN, token: authTokenValue } as const;
  }

  const decodedToken = jwt.verify(authTokenValue, jwtSecret) as JwtPayload;
  switch (decodedToken.authTokenType) {
    case AuthTokenType.ACCESS_TOKEN:
      return { authMode: AuthMode.JWT, token: decodedToken as AuthModeJwtTokenPayload } as const;
    case AuthTokenType.API_KEY:
      return { authMode: AuthMode.API_KEY_V2, token: decodedToken } as const;
    case AuthMode.SERVICE_ACCESS_TOKEN:
      return { authMode: AuthMode.SERVICE_ACCESS_TOKEN, token: decodedToken } as const;
    default:
      return { authMode: null, token: null } as const;
  }
};

const getJwtIdentity = async (server: FastifyZodProvider, token: AuthModeJwtTokenPayload) => {
  const session = await server.services.authToken.getUserTokenSessionById(
    token.tokenVersionId,
    token.userId
  );

  if (!session) throw new UnauthorizedError({ name: "Session not found" });
  if (token.accessVersion !== session.accessVersion)
    throw new UnauthorizedError({ name: "Stale session" });

  const user = await server.store.user.findById(session.userId);
  if (!user || !user.isAccepted) throw new UnauthorizedError({ name: "Token user not found" });

  return { user, tokenVersionId: token.tokenVersionId };
};

export const injectIdentity = fp(async (server: FastifyZodProvider) => {
  server.decorateRequest("auth", null);
  server.addHook("onRequest", async (req) => {
    const appCfg = getConfig();
    const { authMode, token } = await extractAuth(req, appCfg.JWT_AUTH_SECRET);
    if (!authMode) return;
    // TODO(akhilmhdh-pg): fill in rest of auth mode logic
    switch (authMode) {
      case AuthMode.JWT: {
        const { user, tokenVersionId } = await getJwtIdentity(
          server,
          token as AuthModeJwtTokenPayload
        );
        req.auth = { authMode: AuthMode.JWT, user, userId: user.id, tokenVersionId };
        break;
      }
      case AuthMode.SERVICE_TOKEN:
        break;
      case AuthMode.SERVICE_ACCESS_TOKEN:
        break;
      case AuthMode.API_KEY:
        break;
      case AuthMode.API_KEY_V2:
        break;
      default:
        throw new UnauthorizedError({ name: "Unknown token strategy" });
    }
  });
});
