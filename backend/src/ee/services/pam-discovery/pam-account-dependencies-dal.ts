import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TPamAccountDependencies } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TPamAccountDependenciesDALFactory = ReturnType<typeof pamAccountDependenciesDALFactory>;

export const pamAccountDependenciesDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.PamAccountDependency);

  const findByAccountId = async (accountId: string, tx?: Knex) => {
    try {
      const docs = await (tx || db.replicaNode())(TableName.PamAccountDependency)
        .where({ accountId })
        .orderBy("name", "asc");

      return docs as TPamAccountDependencies[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find PAM account dependencies by account ID" });
    }
  };

  const findByResourceId = async (resourceId: string, tx?: Knex) => {
    try {
      const docs = await (tx || db.replicaNode())(TableName.PamAccountDependency)
        .where({ resourceId })
        .orderBy("name", "asc");

      return docs as TPamAccountDependencies[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find PAM account dependencies by resource ID" });
    }
  };

  const upsertDependency = async (
    data: {
      accountId: string;
      resourceId: string;
      dependencyType: string;
      name: string;
      displayName?: string | null;
      state?: string | null;
      data: Record<string, unknown>;
      source: string;
    },
    tx?: Knex
  ) => {
    try {
      const knex = tx || db;

      const [doc] = await knex(TableName.PamAccountDependency)
        .insert({
          ...data,
          isEnabled: false
        })
        .onConflict(["accountId", "resourceId", "dependencyType", "name"])
        .merge({
          displayName: data.displayName,
          state: data.state,
          data: data.data
          // Note: isEnabled is NOT merged - preserves admin's explicit enable/disable
        })
        .returning("*");

      return doc;
    } catch (error) {
      throw new DatabaseError({ error, name: "Upsert PAM account dependency" });
    }
  };

  return {
    ...orm,
    findByAccountId,
    findByResourceId,
    upsertDependency
  };
};
