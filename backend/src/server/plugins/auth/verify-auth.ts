import { FastifyReply, FastifyRequest, HookHandlerDoneFunction } from "fastify";

import { UnauthorizedError } from "@app/lib/errors";
import { AuthMode } from "@app/services/auth/auth-type";

export const verifyAuth =
  <T extends FastifyRequest>(authStrats: AuthMode[], options: { requireOrg: boolean } = { requireOrg: true }) =>
  (req: T, _res: FastifyReply, done: HookHandlerDoneFunction) => {
    if (!Array.isArray(authStrats)) throw new Error("Auth strategy must be array");
    if (!req.auth) throw new UnauthorizedError({ name: "Unauthorized access", message: "Token missing" });

    const isAccessAllowed = authStrats.some((strat) => strat === req.auth.authMode);
    if (!isAccessAllowed) {
      throw new UnauthorizedError({ name: `${req.url} Unauthorized Access` });
    }

    // New optional option. There are some routes which do not require an organization ID to be present on the request.
    // En example of this is the /v1 auth routes.
    if (options.requireOrg === true && !req.permission.orgId) {
      throw new UnauthorizedError({ name: `${req.url} Unauthorized Access, no organization found` });
    }

    done();
  };
