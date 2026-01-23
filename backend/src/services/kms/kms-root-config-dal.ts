import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

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

  return { ...kmsOrm, findById };
};
