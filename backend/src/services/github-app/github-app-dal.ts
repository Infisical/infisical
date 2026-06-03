import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TGithubApps } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TGitHubAppDALFactory = ReturnType<typeof gitHubAppDALFactory>;

export const gitHubAppDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.GitHubApp);

  const findByIdWithLock = async (id: string, orgId: string, tx: Knex): Promise<TGithubApps | undefined> => {
    const app = await tx(TableName.GitHubApp).where({ id, orgId }).forUpdate().first();
    return app;
  };

  return {
    ...orm,
    findByIdWithLock
  };
};
