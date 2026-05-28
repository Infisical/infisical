import { Knex } from "knex";

import { AccessScope } from "@app/db/schemas";
import { PgSqlLock } from "@app/keystore/keystore";
import { BadRequestError, InternalServerError } from "@app/lib/errors";

import { TMembershipUserDALFactory } from "./membership-user-dal";

type TAssertWillRetainAdminArg = {
  scope: AccessScope;
  scopeOrgId: string;
  scopeProjectId?: string;
  excludeMembershipIds: string[];
  dal: Pick<TMembershipUserDALFactory, "countActiveAdmins">;
  tx: Knex;
};

// Must run inside the same transaction as the membership mutation. The advisory lock keyed on
// (scope, scopeId) serializes admin mutations per org/project so concurrent demote-and-remove
// operations can't both pass the count check and then both proceed.
export const assertWillRetainAdmin = async ({
  scope,
  scopeOrgId,
  scopeProjectId,
  excludeMembershipIds,
  dal,
  tx
}: TAssertWillRetainAdminArg) => {
  if (scope === AccessScope.Project && !scopeProjectId) {
    throw new InternalServerError({ message: "scopeProjectId required for project scope admin guard" });
  }

  const lockScope = scope === AccessScope.Project ? "project" : "org";
  const lockId = scope === AccessScope.Project ? (scopeProjectId as string) : scopeOrgId;
  await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.LastAdminGuard(lockScope, lockId)]);

  const remainingAdmins = await dal.countActiveAdmins({
    scope,
    scopeOrgId,
    scopeProjectId,
    excludeMembershipIds,
    tx
  });

  if (remainingAdmins < 1) {
    const target = scope === AccessScope.Project ? "project" : "organization";
    throw new BadRequestError({
      message: `This action would leave the ${target} with no admin. Promote another user to admin first.`
    });
  }
};
