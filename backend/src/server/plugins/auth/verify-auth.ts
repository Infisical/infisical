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

    // Delegated OAuth access tokens are a distinct auth mode and must be opted into explicitly: a
    // route only accepts them when it lists AuthMode.OAUTH. They are deliberately NOT accepted on
    // the strength of AuthMode.JWT alone. OAuth scopes are enforced later, when a handler builds an
    // org/project permission (the ability is intersected with the granted scopes). A route that
    // authenticates on userId without building a permission never runs that scope narrowing, so
    // letting a delegated token through on JWT alone would bypass scopes entirely. Listing
    // AuthMode.OAUTH is therefore only safe when the handler performs a scope-narrowed permission
    // check, and the route families that cannot are the ones still listing AuthMode.JWT alone:
    // account self-management (/me, password, MFA, sessions, login, signup, notifications),
    // instance super-admin routes (verifySuperAdmin reads user.superAdmin, not a CASL ability), and
    // the OAuth client/consent routes themselves, where a delegated token could widen its own grant.
    // A useful proxy: no route passing `requireOrg: false` accepts AuthMode.OAUTH, because without an
    // org in context there is no ability to intersect the granted scopes against.
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
