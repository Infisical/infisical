import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TGitHubAppDALFactory = ReturnType<typeof gitHubAppDALFactory>;

export const gitHubAppDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.GitHubApp);
  return orm;
};
