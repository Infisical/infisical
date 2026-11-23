import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto/cryptography";
import { ForbiddenRequestError } from "@app/lib/errors";
import { TAuthMode } from "@app/server/plugins/auth/inject-identity";

import { ActorType } from "../auth/auth-type";
import { getServerCfg } from "./super-admin-service";
import { SuperAdminErrorCode } from "./super-admin-types";

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

export const assertInitialSetupActivationToken = (providedToken?: string) => {
  const expectedToken = getConfig().INITIAL_SETUP_ACTIVATION_TOKEN;
  if (!expectedToken) return;

  const sha256 = (value: string) => crypto.nativeCrypto.createHash("sha256").update(value).digest();
  const isValid =
    !!providedToken && crypto.nativeCrypto.timingSafeEqual(sha256(expectedToken), sha256(providedToken.trim()));

  if (!isValid) {
    throw new ForbiddenRequestError({
      name: SuperAdminErrorCode.InvalidActivationToken,
      message: "The activation token is missing or incorrect."
    });
  }
};
