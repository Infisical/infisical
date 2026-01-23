import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { TRelays } from "@app/db/schemas/relays";
import { DatabaseError } from "@app/lib/errors";
import { buildFindFilter, ormify, TFindFilter, TFindOpt } from "@app/lib/knex";

export type TRelayDALFactory = ReturnType<typeof relayDalFactory>;

export const relayDalFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.Relay);

  const find = async (
    filter: TFindFilter<TRelays> & { isHeartbeatStale?: boolean },
    { offset, limit, sort, tx }: TFindOpt<TRelays> = {}
  ) => {
    try {
      const { isHeartbeatStale, ...regularFilter } = filter;

      const query = (tx || db.replicaNode())(TableName.Relay)
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        .where(buildFindFilter(regularFilter, TableName.Relay));

      if (isHeartbeatStale) {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        void query.whereNotNull(`${TableName.Relay}.heartbeat`);
        void query.where(`${TableName.Relay}.heartbeat`, "<", oneHourAgo);
        void query.where((v) => {
          void v
            .whereNull(`${TableName.Relay}.healthAlertedAt`)
            .orWhere(`${TableName.Relay}.healthAlertedAt`, "<", db.ref("heartbeat").withSchema(TableName.Relay));
        });
      }

      if (limit) void query.limit(limit);
      if (offset) void query.offset(offset);
      if (sort) {
        void query.orderBy(sort.map(([column, order, nulls]) => ({ column: column as string, order, nulls })));
      }

      const docs = await query;
      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: `${TableName.Relay}: Find` });
    }
  };

  return { ...orm, find };
};
