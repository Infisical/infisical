import { FastifyRequest } from "fastify";

import { UnauthorizedError } from "@app/lib/errors";

export const verifySuperAdmin = async <T extends FastifyRequest>(req: T) => {
  if (!req.auth.user.superAdmin)
    throw new UnauthorizedError({
      name: "Unauthorized access",
      message: "Requires superadmin access"
    });
};
