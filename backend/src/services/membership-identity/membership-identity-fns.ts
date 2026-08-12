import { Knex } from "knex";

import { AccessScope, IdentityAuthMethod } from "@app/db/schemas";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";

import { TMembershipIdentityDALFactory } from "./membership-identity-dal";

const IDENTITY_LAST_LOGIN_DEBOUNCE_SECONDS = 10;

type TIdentityLastLoginTarget = {
  id: string;
  orgId: string;
  projectId?: string | null;
};

export const shouldRecordIdentityLastLogin = async (
  keyStore: Pick<TKeyStoreFactory, "setItemWithExpiryNX">,
  identityId: string
) =>
  Boolean(
    await keyStore.setItemWithExpiryNX(
      KeyStorePrefixes.IdentityLastLoginDebounce(identityId),
      IDENTITY_LAST_LOGIN_DEBOUNCE_SECONDS,
      "1"
    )
  );

export const recordIdentityLastLogin = async (
  membershipIdentityDAL: Pick<TMembershipIdentityDALFactory, "update">,
  identity: TIdentityLastLoginTarget,
  lastLoginAuthMethod: IdentityAuthMethod,
  tx?: Knex
) => {
  await membershipIdentityDAL.update(
    identity.projectId
      ? {
          scope: AccessScope.Project,
          scopeOrgId: identity.orgId,
          scopeProjectId: identity.projectId,
          actorIdentityId: identity.id
        }
      : {
          scope: AccessScope.Organization,
          scopeOrgId: identity.orgId,
          actorIdentityId: identity.id
        },
    { lastLoginAuthMethod, lastLoginTime: new Date() },
    tx
  );
};

export const recordIdentityLastLoginDebounced = async ({
  keyStore,
  membershipIdentityDAL,
  identity,
  lastLoginAuthMethod
}: {
  keyStore: Pick<TKeyStoreFactory, "setItemWithExpiryNX">;
  membershipIdentityDAL: Pick<TMembershipIdentityDALFactory, "update">;
  identity: TIdentityLastLoginTarget;
  lastLoginAuthMethod: IdentityAuthMethod;
}) => {
  if (!(await shouldRecordIdentityLastLogin(keyStore, identity.id))) return;

  await recordIdentityLastLogin(membershipIdentityDAL, identity, lastLoginAuthMethod);
};
