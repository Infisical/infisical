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

  // Keeps the github_app_connections link row in sync with the connection's credentials. A null
  // githubAppId means the connection uses the instance-default (shared) app — no link row.
  const upsertConnectionLink = async (
    { appConnectionId, githubAppId }: { appConnectionId: string; githubAppId: string | null },
    tx: Knex
  ) => {
    if (!githubAppId) {
      await tx(TableName.GitHubAppConnection).where({ appConnectionId }).delete();
      return;
    }

    await tx(TableName.GitHubAppConnection)
      .insert({ appConnectionId, githubAppId })
      .onConflict("appConnectionId")
      .merge();
  };

  // Returns connection counts per GitHub App for the org, keyed by app id. The null key counts
  // GitHub App method connections with no link row, i.e. those using the instance-default app.
  // Counts are org-wide: org apps are usable from any project, so an app's usage (and its delete
  // protection) spans every scope in the org.
  const countConnectionsPerApp = async (orgId: string, tx?: Knex) => {
    const linkedRows = (await (tx || db.replicaNode())(TableName.GitHubAppConnection)
      .join(
        TableName.AppConnection,
        `${TableName.GitHubAppConnection}.appConnectionId`,
        `${TableName.AppConnection}.id`
      )
      .where(`${TableName.AppConnection}.orgId`, orgId)
      .groupBy(`${TableName.GitHubAppConnection}.githubAppId`)
      .select(`${TableName.GitHubAppConnection}.githubAppId`)
      .count(`${TableName.GitHubAppConnection}.id`)) as { githubAppId: string; count: string | number }[];

    const sharedRow = await (tx || db.replicaNode())(TableName.AppConnection)
      .where(`${TableName.AppConnection}.orgId`, orgId)
      .andWhere(`${TableName.AppConnection}.app`, "github")
      .andWhere(`${TableName.AppConnection}.method`, "github-app")
      .whereNotExists((qb) => {
        void qb
          .select("id")
          .from(TableName.GitHubAppConnection)
          .whereRaw(`"${TableName.GitHubAppConnection}"."appConnectionId" = "${TableName.AppConnection}"."id"`);
      })
      .count("id")
      .first();

    const counts = new Map<string | null, number>();
    linkedRows.forEach((row) => {
      counts.set(row.githubAppId, parseInt(String(row.count || "0"), 10));
    });
    counts.set(null, parseInt(String(sharedRow?.count || "0"), 10));

    return counts;
  };

  return {
    ...orm,
    findByIdWithLock,
    upsertConnectionLink,
    countConnectionsPerApp
  };
};
