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
      const conn = tx || db.replicaNode();

      const batch = await conn(TableName.ScimToken)
        .join(TableName.Organization, `${TableName.Organization}.id`, `${TableName.ScimToken}.orgId`)
        .whereRaw(
          `
          (${TableName.ScimToken}."ttlDays" > 0 AND
           (${TableName.ScimToken}."createdAt" + INTERVAL '1 day' * ${TableName.ScimToken}."ttlDays") < NOW() + INTERVAL '1 day' AND
           (${TableName.ScimToken}."createdAt" + INTERVAL '1 day' * ${TableName.ScimToken}."ttlDays") > NOW())
        `
        )
        .where(`${TableName.ScimToken}.expiryNotificationSent`, false)
        .select<TExpiringScimToken[]>(
          conn.ref("id").withSchema(TableName.ScimToken),
          conn.ref("ttlDays").withSchema(TableName.ScimToken),
          conn.ref("description").withSchema(TableName.ScimToken),
          conn.ref("orgId").withSchema(TableName.ScimToken),
          conn.ref("createdAt").withSchema(TableName.ScimToken),
          conn.ref("name").withSchema(TableName.Organization).as("orgName"),
          conn.raw(`
            COALESCE(
              (
                SELECT array_agg(${TableName.Users}.email)
                FROM ${TableName.Membership}
                JOIN ${TableName.MembershipRole} ON ${TableName.Membership}.id = ${TableName.MembershipRole}."membershipId"
                JOIN ${TableName.Users} ON ${TableName.Membership}."actorUserId" = ${TableName.Users}.id
                WHERE ${TableName.Membership}."scopeOrgId" = ${TableName.ScimToken}."orgId"
                  AND ${TableName.Membership}.scope = '${AccessScope.Organization}'
                  AND ${TableName.MembershipRole}.role = '${OrgMembershipRole.Admin}'
                  AND ${TableName.Membership}.status != '${OrgMembershipStatus.Invited}'
                  AND ${TableName.Membership}."actorUserId" IS NOT NULL
                  AND ${TableName.Users}."isGhost" = false
                  AND ${TableName.Users}.email IS NOT NULL
              ),
              ARRAY[]::text[]
            ) as "adminEmails"
          `)
        )
        .limit(batchSize)
        .offset(offset);

      return batch;
    } catch (err) {
      throw new DatabaseError({ error: err, name: "FindExpiringTokens" });
    }
  };

  return { ...scimTokenOrm, findExpiringTokens };
};
