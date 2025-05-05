import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TProjectMicrosoftTeamsConfigDALFactory = ReturnType<typeof projectMicrosoftTeamsConfigDALFactory>;

export const projectMicrosoftTeamsConfigDALFactory = (db: TDbClient) => {
  const projectMicrosoftTeamsConfigOrm = ormify(db, TableName.ProjectMicrosoftTeamsConfigs);

  const getIntegrationDetailsByProject = (projectId: string, tx?: Knex) => {
    return (tx || db.replicaNode())(TableName.ProjectMicrosoftTeamsConfigs)
      .join(
        TableName.MicrosoftTeamsIntegrations,
        `${TableName.ProjectMicrosoftTeamsConfigs}.microsoftTeamsIntegrationId`,
        `${TableName.MicrosoftTeamsIntegrations}.id`
      )
      .where("projectId", "=", projectId)
      .select(
        selectAllTableCols(TableName.ProjectMicrosoftTeamsConfigs),
        selectAllTableCols(TableName.MicrosoftTeamsIntegrations)
      )
      .first();
  };

  return { ...projectMicrosoftTeamsConfigOrm, getIntegrationDetailsByProject };
};
