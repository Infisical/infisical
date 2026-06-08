import { FastifyReply, FastifyRequest, HookHandlerDoneFunction } from "fastify";

import { ForbiddenRequestError, UnauthorizedError } from "@app/lib/errors";
import { AuthMode } from "@app/services/auth/auth-type";

interface TAuthOptions {
  requireOrg: boolean;
}

export const verifyAuth =
  (authStrategies: AuthMode[], options: TAuthOptions = { requireOrg: true }) =>
  <TReq extends FastifyRequest, TRes extends FastifyReply>(req: TReq, _res: TRes, done: HookHandlerDoneFunction) => {
    if (req.shouldForwardWritesToPrimaryInstance && req.method !== "GET") {
      return done();
    }

    if (!Array.isArray(authStrategies)) throw new Error("Auth strategy must be array");
    if (!req.auth) throw new UnauthorizedError({ message: "Token missing" });

    const isAccessAllowed = authStrategies.some((strategy) => {
      if (strategy === req.auth.authMode) return true;
      // Delegated OAuth access tokens act on behalf of the user, so they satisfy any route that
      // accepts a first-party user JWT. They remain a distinct auth mode (carrying oauthClientId)
      // for audit and per-client revocation; this is intentionally one-directional — a route that
      // lists only AuthMode.OAUTH is NOT satisfied by a session JWT. To fence a sensitive route off
      // from delegated access, omit AuthMode.JWT or check req.auth.oauthClientId in the handler.
      if (strategy === AuthMode.JWT && req.auth.authMode === AuthMode.OAUTH) return true;
      return false;
    });
    if (!isAccessAllowed) {
      throw new ForbiddenRequestError({ name: `Forbidden access to ${req.url}` });
    }

    // New optional option. There are some routes which do not require an organization ID to be present on the request.
    // An example of this is the /v1 auth routes.
    if (
      (req.auth.authMode === AuthMode.JWT || req.auth.authMode === AuthMode.OAUTH) &&
      options.requireOrg === true &&
      !req.permission.orgId
    ) {
      throw new UnauthorizedError({ name: `${req.url} Unauthorized Access, no organization found in request` });
    }

    done();
  };
