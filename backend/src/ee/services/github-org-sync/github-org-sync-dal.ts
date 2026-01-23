import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify } from "@app/lib/knex";

export type TGithubOrgSyncDALFactory = ReturnType<typeof githubOrgSyncDALFactory>;

export const githubOrgSyncDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.GithubOrgSyncConfig);
  return orm;
};
