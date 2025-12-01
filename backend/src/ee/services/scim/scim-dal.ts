import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { AccessScope, OrgMembershipRole, OrgMembershipStatus, TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

import { TExpiringScimToken } from "./scim-types";

export type TScimDALFactory = ReturnType<typeof scimDALFactory>;

export const scimDALFactory = (db: TDbClient) => {
  const scimTokenOrm = ormify(db, TableName.ScimToken);

  const findExpiringTokens = async (tx?: Knex, batchSize = 500, offset = 0): Promise<TExpiringScimToken[]> => {
    try {
      const batch = await (tx || db.replicaNode())(TableName.ScimToken)
        .leftJoin(TableName.Organization, `${TableName.Organization}.id`, `${TableName.ScimToken}.orgId`)
        .leftJoin(TableName.Membership, `${TableName.Membership}.scopeOrgId`, `${TableName.ScimToken}.orgId`)
        .leftJoin(TableName.MembershipRole, `${TableName.MembershipRole}.membershipId`, `${TableName.Membership}.id`)
        .leftJoin(TableName.Users, `${TableName.Users}.id`, `${TableName.Membership}.actorUserId`)
        .whereRaw(
          `
          (${TableName.ScimToken}."ttlDays" > 0 AND
          (${TableName.ScimToken}."createdAt" + INTERVAL '1 day' * ${TableName.ScimToken}."ttlDays") < NOW() + INTERVAL '7 days' AND
          (${TableName.ScimToken}."createdAt" + INTERVAL '1 day' * ${TableName.ScimToken}."ttlDays") > NOW())
        `
        )
        .where(`${TableName.ScimToken}.expiryNotificationSent`, false)
        .where(`${TableName.Membership}.scope`, AccessScope.Organization)
        .where(`${TableName.MembershipRole}.role`, OrgMembershipRole.Admin)
        .whereNot(`${TableName.Membership}.status`, OrgMembershipStatus.Invited)
        .whereNotNull(`${TableName.Membership}.actorUserId`)
        .where(`${TableName.Users}.isGhost`, false)
        .whereNotNull(`${TableName.Users}.email`)
        .groupBy([`${TableName.ScimToken}.id`, `${TableName.Organization}.name`])
        .select<TExpiringScimToken[]>([
          db.ref("id").withSchema(TableName.ScimToken),
          db.ref("ttlDays").withSchema(TableName.ScimToken),
          db.ref("description").withSchema(TableName.ScimToken),
          db.ref("orgId").withSchema(TableName.ScimToken),
          db.ref("createdAt").withSchema(TableName.ScimToken),
          db.ref("name").withSchema(TableName.Organization).as("orgName"),
          db.raw(`array_agg(${TableName.Users}."email") as "adminEmails"`)
        ])
        .limit(batchSize)
        .offset(offset);

      return batch;
    } catch (err) {
      throw new DatabaseError({ error: err, name: "FindExpiringTokens" });
    }
  };

  return { ...scimTokenOrm, findExpiringTokens };
};
