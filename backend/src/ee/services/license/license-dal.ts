import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { OrgMembershipStatus, TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";

export type TLicenseDALFactory = ReturnType<typeof licenseDALFactory>;

export const licenseDALFactory = (db: TDbClient) => {
  const countOfOrgIdentities = async (orgId: string | null, orgBillingVersion?: string | null, tx?: Knex) => {
    try {
      const userIdentities = await (tx || db)(TableName.OrgMembership)
        .where({ status: OrgMembershipStatus.Accepted })
        .andWhere((bd) => {
          if (orgId) {
            void bd.where({ orgId });
          }
        })
        .join(TableName.Users, `${TableName.OrgMembership}.userId`, `${TableName.Users}.id`)
        .where(`${TableName.Users}.isGhost`, false)
        .count();

      const userIdentitiesCount =
        typeof userIdentities?.[0].count === "string"
          ? parseInt(userIdentities?.[0].count, 10)
          : userIdentities?.[0].count;
      if (orgBillingVersion === "v0") {
        return userIdentitiesCount;
      }

      const machineIdentities = await (tx || db)(TableName.IdentityOrgMembership)
        .where((bd) => {
          if (orgId) {
            void bd.where(`${TableName.IdentityOrgMembership}.orgId`, orgId);
          }
        })
        .join(TableName.Identity, `${TableName.IdentityOrgMembership}.identityId`, `${TableName.Identity}.id`)
        .count();

      const machineIdentitiesCount =
        typeof machineIdentities?.[0].count === "string"
          ? parseInt(machineIdentities?.[0].count, 10)
          : machineIdentities?.[0].count;

      return userIdentitiesCount + machineIdentitiesCount;
    } catch (error) {
      throw new DatabaseError({ error, name: "Count of Org Members" });
    }
  };

  return { countOfOrgIdentities };
};
