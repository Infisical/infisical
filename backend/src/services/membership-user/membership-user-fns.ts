import { Knex } from "knex";

import { PgSqlLock } from "@app/keystore/keystore";
import { BadRequestError } from "@app/lib/errors";

import { TMembershipUserDALFactory } from "./membership-user-dal";

type TAssertWillRetainOrgAdminArg = {
  scopeOrgId: string;
  excludeMembershipIds: string[];
  dal: Pick<TMembershipUserDALFactory, "countActiveAdmins">;
  tx: Knex;
};

// Must run inside the same transaction as the membership mutation. The advisory lock keyed on
// (scope, scopeId) serializes admin mutations per org so concurrent demote-and-remove
// operations can't both pass the count check and then both proceed.
export const assertWillRetainOrgAdmin = async ({
  scopeOrgId,
  excludeMembershipIds,
  dal,
  tx
}: TAssertWillRetainOrgAdminArg) => {
  await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.LastAdminGuard("org", scopeOrgId)]);

  const remainingOrgAdmins = await dal.countActiveAdmins({
    scopeOrgId,
    excludeMembershipIds,
    tx
  });

  if (remainingOrgAdmins < 1) {
    throw new BadRequestError({
      message: `This action would leave the organization with no admin. Promote another user to admin first.`
    });
  }
};
