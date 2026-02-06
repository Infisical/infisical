import { FastifyReply, FastifyRequest, HookHandlerDoneFunction } from "fastify";

import { ForbiddenRequestError } from "@app/lib/errors";
import { isSuperAdmin } from "@app/services/super-admin/super-admin-fns";

export const verifySuperAdmin = <T extends FastifyRequest>(
  req: T,
  _res: FastifyReply,
  done: HookHandlerDoneFunction
) => {
  if (isSuperAdmin(req.auth)) {
    return done();
  }

  throw new ForbiddenRequestError({
    message: "Requires elevated super admin privileges"
  });
};
