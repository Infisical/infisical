import type { TInstanceConfigService } from "@app/domains/platform/instance-config-core/ce/module";
import { ActorType } from "@app/lib/auth/actor-types";
import { ForbiddenRequestError } from "@app/lib/errors";
import { TAuthMode } from "@app/server/plugins/auth/inject-identity";

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
  instanceConfigService: TInstanceConfigService,
  identityId: string,
  isActorSuperAdmin?: boolean
) => {
  if (!isActorSuperAdmin && (await instanceConfigService.isInstanceAdminIdentity(identityId))) {
    throw new ForbiddenRequestError({
      message:
        "You are attempting to modify an instance admin identity. This requires elevated instance admin privileges"
    });
  }
};
