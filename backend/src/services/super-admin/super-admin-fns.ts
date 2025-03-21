import { ForbiddenRequestError } from "@app/lib/errors";
import { TAuthMode } from "@app/server/plugins/auth/inject-identity";

import { ActorType } from "../auth/auth-type";
import { getServerCfg } from "./super-admin-service";

export const isSuperAdmin = (auth: TAuthMode) => {
  if (auth.actor === ActorType.USER && auth.user.superAdmin) {
    return true;
  }

  if (auth.actor === ActorType.IDENTITY && auth.isInstanceAdmin) {
    return true;
  }

  return false;
};

export const validateIdentityUpdateForSuperAdminPrivileges = async (
  identityId: string,
  isActorSuperAdmin?: boolean
) => {
  const serverCfg = await getServerCfg();
  if (serverCfg.adminIdentityIds?.includes(identityId) && !isActorSuperAdmin) {
    throw new ForbiddenRequestError({
      message:
        "You are attempting to modify an instance admin identity. This requires elevated instance admin privileges"
    });
  }
};
