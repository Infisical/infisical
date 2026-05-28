import { Knex } from "knex";

import { AccessScope } from "@app/db/schemas";
import { BadRequestError, InternalServerError } from "@app/lib/errors";

import { TMembershipUserDALFactory } from "./membership-user-dal";

type TAssertWillRetainAdminArg = {
  scope: AccessScope;
  scopeOrgId: string;
  scopeProjectId?: string;
  excludeMembershipIds: string[];
  dal: Pick<TMembershipUserDALFactory, "countActiveAdmins">;
  tx?: Knex;
};

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
