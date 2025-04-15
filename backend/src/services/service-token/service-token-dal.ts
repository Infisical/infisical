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

  const findExpiredTokens = async (tx?: Knex) => {
    try {
      const docs: { name: string; projectName: string; createdByEmail: string; id: string; projectId: string }[] =
        await (tx || db.replicaNode())(TableName.ServiceToken)
          .leftJoin<TUsers>(
            TableName.Users,
            `${TableName.Users}.id`,
            db.raw(`${TableName.ServiceToken}."createdBy"::uuid`)
          )
          .join(TableName.Project, `${TableName.Project}.id`, `${TableName.ServiceToken}.projectId`)
          .whereRaw(
            `${TableName.ServiceToken}."expiresAt" < NOW() AND ${TableName.ServiceToken}."notificationSent" = false`
          )
          .whereNotNull(`${TableName.Users}.email`)
          .select(`${TableName.ServiceToken}.name`)
          .select(`${TableName.ServiceToken}.id`)
          .select(`${TableName.Project}.name as projectName`)
          .select(`${TableName.ServiceToken}.projectId`)
          .select(`${TableName.Users}.email as createdByEmail`);

      return docs;
    } catch (err) {
      throw new DatabaseError({ error: err, name: "FindExpiredTokens" });
    }
  };
  return { ...stOrm, findById, findExpiredTokens };
};
