import { FastifyReply, FastifyRequest, HookHandlerDoneFunction } from "fastify";

import { UnauthorizedError } from "@app/lib/errors";
import { AuthMode } from "@app/services/auth/auth-type";

interface TAuthOptions {
  requireOrg: boolean;
}

export const verifyAuth =
  <T extends FastifyRequest>(authStrategies: AuthMode[], options: TAuthOptions = { requireOrg: true }) =>
  (req: T, _res: FastifyReply, done: HookHandlerDoneFunction) => {
    if (!Array.isArray(authStrategies)) throw new Error("Auth strategy must be array");
    if (!req.auth) throw new UnauthorizedError({ name: "Unauthorized access", message: "Token missing" });

    const isAccessAllowed = authStrategies.some((strategy) => strategy === req.auth.authMode);
    if (!isAccessAllowed) {
      throw new UnauthorizedError({ name: `${req.url} Unauthorized Access` });
    }

    // New optional option. There are some routes which do not require an organization ID to be present on the request.
    // An example of this is the /v1 auth routes.
    if (req.auth.authMode === AuthMode.JWT && options.requireOrg === true && !req.permission.orgId) {
      throw new UnauthorizedError({ name: `${req.url} Unauthorized Access, no organization found in request` });
    }

    done();
  };
