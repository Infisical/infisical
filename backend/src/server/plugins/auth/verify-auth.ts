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

    // Delegated OAuth access tokens are a separate auth mode a route has to opt into by listing
    // AuthMode.OAUTH, deliberately not accepted on AuthMode.JWT alone. Scopes are only enforced when a
    // handler builds an org/project permission, since that's where the ability gets intersected with
    // them, so a route that authenticates on userId and builds no permission would skip the narrowing
    // entirely. The families that can't do that check stay on AuthMode.JWT alone: account
    // self-management (/me, password, MFA, sessions, login, signup, notifications), super-admin routes
    // (verifySuperAdmin reads user.superAdmin, not a CASL ability), and the OAuth client/consent routes
    // themselves, where a delegated token could widen its own grant. Rough proxy: nothing passing
    // `requireOrg: false` accepts AuthMode.OAUTH, since with no org there's no ability to intersect.
    const isAccessAllowed = authStrategies.some((strategy) => strategy === req.auth.authMode);
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
