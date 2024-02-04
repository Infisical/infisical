import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TGitAppOrgInsert } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TGitAppDALFactory = ReturnType<typeof gitAppDALFactory>;

export const gitAppDALFactory = (db: TDbClient) => {
  const gitAppOrm = ormify(db, TableName.GitAppOrg);

  const upsert = async (data: TGitAppOrgInsert, tx?: Knex) => {
    try {
      const [doc] = await (tx || db)(TableName.GitAppOrg).insert(data).onConflict("orgId").merge().returning("*");
      return doc;
    } catch (error) {
      throw new DatabaseError({ error, name: "UpsertGitAppOrm" });
    }
  };

  return { ...gitAppOrm, upsert };
};
