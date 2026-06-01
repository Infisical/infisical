import { TUserAliases, TUsers } from "@app/db/schemas";

import { TUserDALFactory } from "../user/user-dal";
import { TUserAliasDALFactory } from "./user-alias-dal";

type TEnsureSsoAccountVerifiedDTO = {
  user: TUsers;
  userAlias: TUserAliases;
  userDAL: Pick<TUserDALFactory, "transaction" | "updateById">;
  userAliasDAL: Pick<TUserAliasDALFactory, "updateById">;
};

/**
 * When an org enforces SSO, the verified domain + IdP are authoritative, so we skip the separate
 * email-verification step. This marks the user + alias as verified/accepted before a session is
 * issued, covering accounts provisioned before enforcement was enabled as well as freshly created
 * ones. No-op when everything is already verified. Returns the (possibly updated) records so the
 * caller can keep its in-memory copies in sync.
 */
export const ensureSsoAccountVerified = async ({
  user,
  userAlias,
  userDAL,
  userAliasDAL
}: TEnsureSsoAccountVerifiedDTO): Promise<{ user: TUsers; userAlias: TUserAliases }> => {
  if (userAlias.isEmailVerified && user.isAccepted && user.isEmailVerified) {
    return { user, userAlias };
  }

  await userDAL.transaction(async (tx) => {
    if (!userAlias.isEmailVerified) {
      await userAliasDAL.updateById(userAlias.id, { isEmailVerified: true }, tx);
    }
    if (!user.isAccepted || !user.isEmailVerified) {
      await userDAL.updateById(user.id, { isAccepted: true, isEmailVerified: true }, tx);
    }
  });

  return {
    user: { ...user, isAccepted: true, isEmailVerified: true },
    userAlias: { ...userAlias, isEmailVerified: true }
  };
};
