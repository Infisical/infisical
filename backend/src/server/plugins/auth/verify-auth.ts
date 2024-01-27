import { FastifyRequest } from "fastify";

import { UnauthorizedError } from "@app/lib/errors";
import { AuthMode } from "@app/services/auth/auth-type";

export const verifyAuth =
  <T extends FastifyRequest>(authStrats: AuthMode[]) =>
  async (req: T) => {
    if (!Array.isArray(authStrats)) throw new Error("Auth strategy must be array");
    if (!req.auth)
      throw new UnauthorizedError({ name: "Unauthorized access", message: "Token missing" });

    const isAccessAllowed = authStrats.some((strat) => strat === req.auth.authMode);
    if (!isAccessAllowed) {
      throw new UnauthorizedError({ name: `${req.url} Unauthorized Access` });
    }
  };
