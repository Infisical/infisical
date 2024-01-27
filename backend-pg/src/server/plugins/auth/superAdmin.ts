import { FastifyRequest } from "fastify";

import { UnauthorizedError } from "@app/lib/errors";
import { ActorType } from "@app/services/auth/auth-type";

export const verifySuperAdmin = async <T extends FastifyRequest>(req: T) => {
  if (req.auth.actor !== ActorType.USER || !req.auth.user.superAdmin)
    throw new UnauthorizedError({
      name: "Unauthorized access",
      message: "Requires superadmin access"
    });
};
