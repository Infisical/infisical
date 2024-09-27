import { FastifyReply, FastifyRequest, HookHandlerDoneFunction } from "fastify";

import { ForbiddenRequestError } from "@app/lib/errors";
import { ActorType } from "@app/services/auth/auth-type";

export const verifySuperAdmin = <T extends FastifyRequest>(
  req: T,
  _res: FastifyReply,
  done: HookHandlerDoneFunction
) => {
  if (req.auth.actor !== ActorType.USER || !req.auth.user.superAdmin)
    throw new ForbiddenRequestError({
      message: "Requires elevated super admin privileges"
    });
  done();
};
