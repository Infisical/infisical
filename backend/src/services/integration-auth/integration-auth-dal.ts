import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TIntegrationAuths, TIntegrationAuthsUpdate } from "@app/db/schemas";
import { BadRequestError, DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

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

  return {
    ...integrationAuthOrm,
    bulkUpdate
  };
};
