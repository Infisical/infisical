import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TPamAccounts } from "@app/db/schemas";
import { buildFindFilter, ormify, prependTableNameToFindFilter, selectAllTableCols } from "@app/lib/knex";

export type TPamAccountDALFactory = ReturnType<typeof pamAccountDALFactory>;

type PamAccountFindFilter = Parameters<typeof buildFindFilter<TPamAccounts>>[0];

export const pamAccountDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.PamAccount);

  const findWithResourceDetails = async (filter: PamAccountFindFilter, tx?: Knex) => {
    const query = (tx || db.replicaNode())(TableName.PamAccount)
      .leftJoin(TableName.PamResource, `${TableName.PamAccount}.resourceId`, `${TableName.PamResource}.id`)
      .select(selectAllTableCols(TableName.PamAccount))
      .select(
        // resource
        db.ref("name").withSchema(TableName.PamResource).as("resourceName"),
        db.ref("resourceType").withSchema(TableName.PamResource)
      );

    if (filter) {
      /* eslint-disable @typescript-eslint/no-misused-promises */
      void query.where(buildFindFilter(prependTableNameToFindFilter(TableName.PamAccount, filter)));
    }

    const accounts = await query;

    return accounts.map(({ resourceId, resourceName, resourceType, ...account }) => ({
      ...account,
      resourceId,
      resource: {
        id: resourceId,
        name: resourceName,
        resourceType
      }
    }));
  };

  return { ...orm, findWithResourceDetails };
};
