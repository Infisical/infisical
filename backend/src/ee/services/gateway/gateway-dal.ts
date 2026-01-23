import { TDbClient } from "@app/db";
import { GatewaysSchema, TGateways } from "@app/db/schemas/gateways";
import { AccessScope, TableName } from "@app/db/schemas/models";
import { DatabaseError } from "@app/lib/errors";
import { buildFindFilter, ormify, selectAllTableCols, TFindFilter, TFindOpt } from "@app/lib/knex";

export type TGatewayDALFactory = ReturnType<typeof gatewayDALFactory>;

export const gatewayDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.Gateway);

  const find = async (
    filter: TFindFilter<TGateways> & { orgId?: string },
    { offset, limit, sort, tx }: TFindOpt<TGateways> = {}
  ) => {
    try {
      const query = (tx || db.replicaNode())(TableName.Gateway)
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        .where(buildFindFilter(filter, TableName.Gateway, ["orgId"]))
        .join(TableName.Identity, `${TableName.Identity}.id`, `${TableName.Gateway}.identityId`)
        .join(TableName.Membership, `${TableName.Membership}.actorIdentityId`, `${TableName.Gateway}.identityId`)
        .select(selectAllTableCols(TableName.Gateway))
        .select(db.ref("scopeOrgId").withSchema(TableName.Membership).as("identityOrgId"))
        .select(db.ref("name").withSchema(TableName.Identity).as("identityName"))
        .where(`${TableName.Membership}.scope`, AccessScope.Organization);

      if (filter.orgId) {
        void query.where(`${TableName.Membership}.scopeOrgId`, filter.orgId);
      }
      if (limit) void query.limit(limit);
      if (offset) void query.offset(offset);
      if (sort) {
        void query.orderBy(sort.map(([column, order, nulls]) => ({ column: column as string, order, nulls })));
      }

      const docs = await query;

      return docs.map((el) => ({
        ...GatewaysSchema.parse(el),
        orgId: el.identityOrgId,
        identity: { id: el.identityId, name: el.identityName }
      }));
    } catch (error) {
      throw new DatabaseError({ error, name: `${TableName.Gateway}: Find` });
    }
  };

  return { ...orm, find };
};
