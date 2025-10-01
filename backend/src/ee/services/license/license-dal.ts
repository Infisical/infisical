import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { AccessScope, OrgMembershipStatus, TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";

export type TLicenseDALFactory = ReturnType<typeof licenseDALFactory>;

export const licenseDALFactory = (db: TDbClient) => {
  const countOfOrgMembers = async (orgId: string | null, tx?: Knex) => {
    try {
      const doc = await (tx || db.replicaNode())(TableName.Membership)
        .where({ status: OrgMembershipStatus.Accepted, scope: AccessScope.Organization })
        .andWhere((bd) => {
          if (orgId) {
            void bd.where(`${TableName.Membership}.scopeOrgId`, orgId);
          }
        })
        .join(TableName.Users, `${TableName.Membership}.actorUserId`, `${TableName.Users}.id`)
        .where(`${TableName.Users}.isGhost`, false)
        .count();
      return Number(doc?.[0]?.count ?? 0);
    } catch (error) {
      throw new DatabaseError({ error, name: "Count of Org Members" });
    }
  };

  const countOrgUsersAndIdentities = async (orgId: string | null, tx?: Knex) => {
    try {
      // count org users
      const userDoc = await (tx || db.replicaNode())(TableName.Membership)
        .where({ status: OrgMembershipStatus.Accepted, scope: AccessScope.Organization })
        .whereNotNull(`${TableName.Membership}.actorUserId`)
        .andWhere((bd) => {
          if (orgId) {
            void bd.where(`${TableName.Membership}.scopeOrgId`, orgId);
          }
        })
        .join(TableName.Users, `${TableName.Membership}.userId`, `${TableName.Users}.id`)
        .where(`${TableName.Users}.isGhost`, false)
        .count();

      const userCount = Number(userDoc?.[0].count);

      // count org identities
      const identityDoc = await (tx || db.replicaNode())(TableName.Membership)
        .where({ status: OrgMembershipStatus.Accepted, scope: AccessScope.Organization })
        .whereNotNull(`${TableName.Membership}.actorIdentityId`)
        .where((bd) => {
          if (orgId) {
            void bd.where(`${TableName.Membership}.scopeOrgId`, orgId);
          }
        })
        .count();

      const identityCount = Number(identityDoc?.[0].count);

      return userCount + identityCount;
    } catch (error) {
      throw new DatabaseError({ error, name: "Count of Org Users + Identities" });
    }
  };

  return { countOfOrgMembers, countOrgUsersAndIdentities };
};
