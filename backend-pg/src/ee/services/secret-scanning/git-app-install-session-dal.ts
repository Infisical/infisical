import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName,TGitAppInstallSessionsInsert } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TGitAppInstallSessionDalFactory = ReturnType<typeof gitAppInstallSessionDalFactory>;

export const gitAppInstallSessionDalFactory = (db: TDbClient) => {
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
