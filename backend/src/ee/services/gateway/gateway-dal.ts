import { TDbClient } from "@app/db";
import { TableName, TGateways } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { buildFindFilter, ormify, selectAllTableCols, TFindFilter, TFindOpt } from "@app/lib/knex";

export type TGatewayDALFactory = ReturnType<typeof gatewayDALFactory>;

export const gatewayDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.Gateway);

  const find = async (filter: TFindFilter<TGateways>, { offset, limit, sort, tx }: TFindOpt<TGateways> = {}) => {
    try {
      const query = (tx || db)(TableName.Gateway)
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        .where(buildFindFilter(filter))
        .join(TableName.Identity, `${TableName.Identity}.id`, `${TableName.Gateway}.identityId`)
        .select(selectAllTableCols(TableName.Gateway))
        .select(db.ref("name").withSchema(TableName.Identity).as("identityName"));
      if (limit) void query.limit(limit);
      if (offset) void query.offset(offset);
      if (sort) {
        void query.orderBy(sort.map(([column, order, nulls]) => ({ column: column as string, order, nulls })));
      }

      const docs = await query;
      return docs.map((el) => ({ ...el, identity: { id: el.identityId, name: el.identityName } }));
    } catch (error) {
      throw new DatabaseError({ error, name: `${TableName.Gateway}: Find` });
    }
  };

  return { ...orm, find };
};
