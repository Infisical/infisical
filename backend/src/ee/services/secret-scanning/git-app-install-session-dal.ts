import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TGitAppInstallSessionsInsert } from "@app/db/schemas/git-app-install-sessions";
import { TableName } from "@app/db/schemas/models";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TGitAppInstallSessionDALFactory = ReturnType<typeof gitAppInstallSessionDALFactory>;

export const gitAppInstallSessionDALFactory = (db: TDbClient) => {
  const gitAppInstallSessionOrm = ormify(db, TableName.GitAppInstallSession);

  const upsert = async (data: TGitAppInstallSessionsInsert, tx?: Knex) => {
    try {
      const [doc] = await (tx || db)(TableName.GitAppInstallSession)
        .insert(data)
        .onConflict("orgId")
        .merge()
        .returning("*");
      return doc;
    } catch (error) {
      throw new DatabaseError({ error, name: "UpsertGitAppOrm" });
    }
  };

  return { ...gitAppInstallSessionOrm, upsert };
};
