import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TFeatureDiscoveryDALFactory = ReturnType<typeof featureDiscoveryDALFactory>;

export const featureDiscoveryDALFactory = (db: TDbClient) => {
  const featureDiscoveryOrm = ormify(db, TableName.UserFeatureDiscovery);

  const insertIgnoringDuplicates = async (userId: string, releaseIds: string[], tx?: Knex) => {
    try {
      await (tx || db)(TableName.UserFeatureDiscovery)
        .insert(releaseIds.map((releaseId) => ({ userId, releaseId })))
        .onConflict(["userId", "releaseId"])
        .ignore();
    } catch (error) {
      throw new DatabaseError({ error, name: "InsertIgnoringDuplicates" });
    }
  };

  return { ...featureDiscoveryOrm, insertIgnoringDuplicates };
};
