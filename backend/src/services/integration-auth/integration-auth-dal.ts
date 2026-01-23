import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TIntegrationAuths, TIntegrationAuthsUpdate } from "@app/db/schemas/integration-auths";
import { TableName } from "@app/db/schemas/models";
import { BadRequestError, DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TIntegrationAuthDALFactory = ReturnType<typeof integrationAuthDALFactory>;

export const integrationAuthDALFactory = (db: TDbClient) => {
  const integrationAuthOrm = ormify(db, TableName.IntegrationAuth);

  const bulkUpdate = async (
    data: Array<{ filter: Partial<TIntegrationAuths>; data: TIntegrationAuthsUpdate }>,
    tx?: Knex
  ) => {
    try {
      const integrationAuths = await Promise.all(
        data.map(async ({ filter, data: updateData }) => {
          const [doc] = await (tx || db)(TableName.IntegrationAuth).where(filter).update(updateData).returning("*");
          if (!doc) throw new BadRequestError({ message: "Failed to update document" });
          return doc;
        })
      );
      return integrationAuths;
    } catch (error) {
      throw new DatabaseError({ error, name: "bulk update secret" });
    }
  };

  const getByOrg = async (orgId: string, tx?: Knex) => {
    try {
      const integrationAuths = await (tx || db.replicaNode())(TableName.IntegrationAuth)
        .join(TableName.Project, `${TableName.Project}.id`, `${TableName.IntegrationAuth}.projectId`)
        .join(TableName.Organization, `${TableName.Organization}.id`, `${TableName.Project}.orgId`)
        .where(`${TableName.Organization}.id`, "=", orgId)
        .select(selectAllTableCols(TableName.IntegrationAuth));

      return integrationAuths;
    } catch (error) {
      throw new DatabaseError({ error, name: "get by org" });
    }
  };

  return {
    ...integrationAuthOrm,
    bulkUpdate,
    getByOrg
  };
};
