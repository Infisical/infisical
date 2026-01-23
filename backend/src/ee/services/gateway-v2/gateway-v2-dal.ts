import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { GatewaysV2Schema, TGatewaysV2 } from "@app/db/schemas/gateways-v2";
import { TableName } from "@app/db/schemas/models";
import { DatabaseError } from "@app/lib/errors";
import { buildFindFilter, ormify, selectAllTableCols, TFindFilter, TFindOpt } from "@app/lib/knex";

export type TGatewayV2DALFactory = ReturnType<typeof gatewayV2DalFactory>;

export const gatewayV2DalFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.GatewayV2);

  const find = async (
    filter: TFindFilter<TGatewaysV2> & { isHeartbeatStale?: boolean },
    { offset, limit, sort, tx }: TFindOpt<TGatewaysV2> = {}
  ) => {
    try {
      const { isHeartbeatStale, ...regularFilter } = filter;

      const query = (tx || db.replicaNode())(TableName.GatewayV2)
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        .where(buildFindFilter(regularFilter, TableName.GatewayV2))
        .join(TableName.Identity, `${TableName.Identity}.id`, `${TableName.GatewayV2}.identityId`)
        .select(selectAllTableCols(TableName.GatewayV2))
        .select(db.ref("name").withSchema(TableName.Identity).as("identityName"));

      if (isHeartbeatStale) {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        void query.where(`${TableName.GatewayV2}.heartbeat`, "<", oneHourAgo);
        void query.where((v) => {
          void v
            .whereNull(`${TableName.GatewayV2}.healthAlertedAt`)
            .orWhere(
              `${TableName.GatewayV2}.healthAlertedAt`,
              "<",
              db.ref("heartbeat").withSchema(TableName.GatewayV2)
            );
        });
      }

      if (limit) void query.limit(limit);
      if (offset) void query.offset(offset);
      if (sort) {
        void query.orderBy(sort.map(([column, order, nulls]) => ({ column: column as string, order, nulls })));
      }

      const docs = await query;

      return docs.map((el) => ({
        ...GatewaysV2Schema.parse(el),
        identity: { id: el.identityId, name: el.identityName }
      }));
    } catch (error) {
      throw new DatabaseError({ error, name: `${TableName.GatewayV2}: Find` });
    }
  };

  const findById = async (id: string, tx?: Knex) => {
    try {
      const doc = await (tx || db.replicaNode())(TableName.GatewayV2)
        .join(TableName.Organization, `${TableName.GatewayV2}.orgId`, `${TableName.Organization}.id`)
        .where(`${TableName.GatewayV2}.id`, id)
        .select(selectAllTableCols(TableName.GatewayV2))
        .select(db.ref("name").withSchema(TableName.Organization).as("orgName"))
        .first();

      return doc;
    } catch (error) {
      throw new DatabaseError({ error, name: `${TableName.GatewayV2}: Find by id` });
    }
  };

  return { ...orm, find, findById };
};
