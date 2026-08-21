import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

import { KMS_ROOT_CONFIG_UUID } from "./kms-fns";

export type TKmsRootConfigDALFactory = ReturnType<typeof kmsRootConfigDALFactory>;

export const kmsRootConfigDALFactory = (db: TDbClient) => {
  const kmsOrm = ormify(db, TableName.KmsServerRootConfig);

  const findById = async (id: string, tx?: Knex) => {
    try {
      const result = await (tx || db?.replicaNode?.() || db)(TableName.KmsServerRootConfig)
        .where({ id } as never)
        .first("*");
      return result;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find by id" });
    }
  };

  // Primary: a stale read here means failing to find the key this pod holds, or promoting against a
  // superseded view.
  const findAll = async (tx?: Knex) => {
    try {
      return await (tx || db)(TableName.KmsServerRootConfig).select("*");
    } catch (error) {
      throw new DatabaseError({ error, name: "Find all kms root configs" });
    }
  };

  const findPending = async (tx?: Knex) => {
    try {
      return await (tx || db)(TableName.KmsServerRootConfig)
        .whereNull("activatedAt")
        .whereNot("id", KMS_ROOT_CONFIG_UUID)
        .select("*");
    } catch (error) {
      throw new DatabaseError({ error, name: "Find pending kms root configs" });
    }
  };

  /** Newest first; the GC relies on that ordering. */
  const findRetained = async (tx?: Knex) => {
    try {
      return await (tx || db)(TableName.KmsServerRootConfig)
        .whereNotNull("supersededAt")
        .whereNot("id", KMS_ROOT_CONFIG_UUID)
        .select("*")
        .orderBy("supersededAt", "desc");
    } catch (error) {
      throw new DatabaseError({ error, name: "Find retained kms root configs" });
    }
  };

  // Every pending row, not just the promoted one: an abandoned one is a live working key that would
  // otherwise promote itself if it ever reached a deployment.
  const deleteAllPending = async (tx?: Knex) => {
    try {
      return await (tx || db)(TableName.KmsServerRootConfig)
        .whereNull("activatedAt")
        .whereNot("id", KMS_ROOT_CONFIG_UUID)
        .delete();
    } catch (error) {
      throw new DatabaseError({ error, name: "Delete pending kms root configs" });
    }
  };

  return { ...kmsOrm, findById, findAll, findPending, findRetained, deleteAllPending };
};
