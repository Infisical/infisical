import { TDbClient } from "@app/db";
import { ConnectorsSchema, TableName, TConnectors } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { buildFindFilter, ormify, selectAllTableCols, TFindFilter, TFindOpt } from "@app/lib/knex";

export type TConnectorDALFactory = ReturnType<typeof connectorDalFactory>;

export const connectorDalFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.Connector);

  const find = async (filter: TFindFilter<TConnectors>, { offset, limit, sort, tx }: TFindOpt<TConnectors> = {}) => {
    try {
      const query = (tx || db)(TableName.Connector)
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        .where(buildFindFilter(filter, TableName.Connector))
        .join(TableName.Identity, `${TableName.Identity}.id`, `${TableName.Connector}.identityId`)
        .join(
          TableName.IdentityOrgMembership,
          `${TableName.IdentityOrgMembership}.identityId`,
          `${TableName.Connector}.identityId`
        )
        .select(selectAllTableCols(TableName.Connector))
        .select(db.ref("name").withSchema(TableName.Identity).as("identityName"));

      if (limit) void query.limit(limit);
      if (offset) void query.offset(offset);
      if (sort) {
        void query.orderBy(sort.map(([column, order, nulls]) => ({ column: column as string, order, nulls })));
      }

      const docs = await query;

      return docs.map((el) => ({
        ...ConnectorsSchema.parse(el),
        identity: { id: el.identityId, name: el.identityName }
      }));
    } catch (error) {
      throw new DatabaseError({ error, name: `${TableName.Connector}: Find` });
    }
  };

  return { ...orm, find };
};
