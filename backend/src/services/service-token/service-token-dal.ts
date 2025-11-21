import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TUsers } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TServiceTokenDALFactory = ReturnType<typeof serviceTokenDALFactory>;

export const serviceTokenDALFactory = (db: TDbClient) => {
  const stOrm = ormify(db, TableName.ServiceToken);

  const findById = async (id: string, tx?: Knex) => {
    try {
      const doc = await (tx || db.replicaNode())(TableName.ServiceToken)
        .leftJoin<TUsers>(
          TableName.Users,
          `${TableName.Users}.id`,
          db.raw(`${TableName.ServiceToken}."createdBy"::uuid`)
        )
        .where(`${TableName.ServiceToken}.id`, id)
        .select(selectAllTableCols(TableName.ServiceToken))
        .select(db.ref("email").withSchema(TableName.Users).as("createdByEmail"))
        .first();
      return doc;
    } catch (err) {
      throw new DatabaseError({ error: err, name: "FindById" });
    }
  };

  const findExpiringTokens = async (tx?: Knex, batchSize = 500, offset = 0) => {
    try {
      const batch: {
        name: string;
        projectName: string;
        createdByEmail: string;
        id: string;
        projectId: string;
        orgId: string;
      }[] = await (tx || db.replicaNode())(TableName.ServiceToken)
        .leftJoin<TUsers>(
          TableName.Users,
          `${TableName.Users}.id`,
          db.raw(`${TableName.ServiceToken}."createdBy"::uuid`)
        )
        .join(TableName.Project, `${TableName.Project}.id`, `${TableName.ServiceToken}.projectId`)
        .whereRaw(
          `${TableName.ServiceToken}."expiresAt" < NOW() + INTERVAL '1 day' AND ${TableName.ServiceToken}."expiryNotificationSent" = false`
        )
        .whereNotNull(`${TableName.Users}.email`)
        .select(
          db.ref("id").withSchema(TableName.ServiceToken),
          db.ref("name").withSchema(TableName.ServiceToken),
          db.ref("projectId").withSchema(TableName.ServiceToken),
          db.ref("createdBy").withSchema(TableName.ServiceToken),
          db.ref("email").withSchema(TableName.Users).as("createdByEmail"),
          db.ref("name").withSchema(TableName.Project).as("projectName"),
          db.ref("orgId").withSchema(TableName.Project).as("orgId")
        )
        .limit(batchSize)
        .offset(offset);

      return batch;
    } catch (err) {
      throw new DatabaseError({ error: err, name: "FindExpiredTokens" });
    }
  };

  return { ...stOrm, findById, findExpiringTokens };
};
