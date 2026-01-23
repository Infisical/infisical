import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TGitAppOrgInsert } from "@app/db/schemas/git-app-org";
import { TableName } from "@app/db/schemas/models";
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
