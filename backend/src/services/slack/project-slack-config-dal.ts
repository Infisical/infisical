import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TProjectSlackConfigDALFactory = ReturnType<typeof projectSlackConfigDALFactory>;

export const projectSlackConfigDALFactory = (db: TDbClient) => {
  const projectSlackConfigOrm = ormify(db, TableName.ProjectSlackConfigs);

  const getIntegrationDetailsByProject = (projectId: string, tx?: Knex) => {
    return (tx || db.replicaNode())(TableName.ProjectSlackConfigs)
      .join(
        TableName.SlackIntegrations,
        `${TableName.ProjectSlackConfigs}.slackIntegrationId`,
        `${TableName.SlackIntegrations}.id`
      )
      .where("projectId", "=", projectId)
      .select(selectAllTableCols(TableName.ProjectSlackConfigs), selectAllTableCols(TableName.SlackIntegrations))
      .first();
  };

  return { ...projectSlackConfigOrm, getIntegrationDetailsByProject };
};
