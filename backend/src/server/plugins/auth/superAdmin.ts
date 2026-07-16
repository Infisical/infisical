import { FastifyReply, FastifyRequest, HookHandlerDoneFunction } from "fastify";

import { ForbiddenRequestError } from "@app/lib/errors";
import { isSuperAdmin } from "@app/services/super-admin/super-admin-fns";

export const verifySuperAdmin = <TReq extends FastifyRequest, TRes extends FastifyReply>(
  req: TReq,
  _res: TRes,
  done: HookHandlerDoneFunction
) => {
  if (isSuperAdmin(req.auth)) {
    return done();
  }

  throw new ForbiddenRequestError({
    message: "Requires elevated super admin privileges"
  });
};
