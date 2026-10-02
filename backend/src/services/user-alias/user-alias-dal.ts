import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TUserAliasDALFactory = ReturnType<typeof userAliasDALFactory>;

export const userAliasDALFactory = (db: TDbClient) => {
  const userAliasOrm = ormify(db, TableName.UserAliases);

  /**
   * Exact comparison on externalId, deliberately not folded: it's a case-sensitive identifier (OIDC
   * Core says so for `sub`, SAML likewise for nameID) stored verbatim, so folding could match two
   * different IdP subjects. Trade-off is that an IdP asserting mixed-case identifiers can't be
   * provisioned against, since both invite routes lowercase their input. Fixing that means relaxing
   * those routes, not loosening this.
   *
   * orgIds and aliasTypes are the security boundary: orgIds drops the NULL-org social aliases,
   * aliasTypes is the second lock.
   */
  const findBySsoExternalIds = async (
    { externalIds, orgIds, aliasTypes }: { externalIds: string[]; orgIds: string[]; aliasTypes: string[] },
    tx?: Knex
  ) => {
    try {
      return await (tx || db.replicaNode())(TableName.UserAliases)
        .whereIn("orgId", orgIds)
        .whereIn("aliasType", aliasTypes)
        .whereIn("externalId", externalIds)
        .select("externalId", "userId");
    } catch (error) {
      throw new DatabaseError({ error, name: "Find user aliases by SSO external id" });
    }
  };

  return {
    ...userAliasOrm,
    findBySsoExternalIds
  };
};
