import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TMicrosoftTeamsIntegrations } from "@app/db/schemas/microsoft-teams-integrations";
import { TableName } from "@app/db/schemas/models";
import { TWorkflowIntegrations } from "@app/db/schemas/workflow-integrations";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TMicrosoftTeamsIntegrationDALFactory = ReturnType<typeof microsoftTeamsIntegrationDALFactory>;

export const microsoftTeamsIntegrationDALFactory = (db: TDbClient) => {
  const microsoftTeamsIntegrationOrm = ormify(db, TableName.MicrosoftTeamsIntegrations);

  const findByIdWithWorkflowIntegrationDetails = async (id: string, tx?: Knex) => {
    try {
      return await (tx || db.replicaNode())(TableName.MicrosoftTeamsIntegrations)
        .join(
          TableName.WorkflowIntegrations,
          `${TableName.MicrosoftTeamsIntegrations}.id`,
          `${TableName.WorkflowIntegrations}.id`
        )
        .select(selectAllTableCols(TableName.MicrosoftTeamsIntegrations))
        .select(db.ref("orgId").withSchema(TableName.WorkflowIntegrations))
        .select(db.ref("description").withSchema(TableName.WorkflowIntegrations))
        .select(db.ref("integration").withSchema(TableName.WorkflowIntegrations))
        .select(db.ref("slug").withSchema(TableName.WorkflowIntegrations))
        .select(db.ref("status").withSchema(TableName.WorkflowIntegrations))
        .where(`${TableName.WorkflowIntegrations}.id`, id)
        .first();
    } catch (error) {
      throw new DatabaseError({ error, name: "Find by ID with Workflow integration details" });
    }
  };

  const findWithWorkflowIntegrationDetails = async (
    filter: Partial<TMicrosoftTeamsIntegrations> & Partial<TWorkflowIntegrations>,
    tx?: Knex
  ) => {
    try {
      return await (tx || db.replicaNode())(TableName.MicrosoftTeamsIntegrations)
        .join(
          TableName.WorkflowIntegrations,
          `${TableName.MicrosoftTeamsIntegrations}.id`,
          `${TableName.WorkflowIntegrations}.id`
        )
        .select(selectAllTableCols(TableName.MicrosoftTeamsIntegrations))
        .select(db.ref("orgId").withSchema(TableName.WorkflowIntegrations))
        .select(db.ref("description").withSchema(TableName.WorkflowIntegrations))
        .select(db.ref("integration").withSchema(TableName.WorkflowIntegrations))
        .select(db.ref("slug").withSchema(TableName.WorkflowIntegrations))
        .select(db.ref("status").withSchema(TableName.WorkflowIntegrations))
        .where(filter);
    } catch (error) {
      throw new DatabaseError({ error, name: "Find with Workflow integration details" });
    }
  };

  return {
    ...microsoftTeamsIntegrationOrm,
    findByIdWithWorkflowIntegrationDetails,
    findWithWorkflowIntegrationDetails
  };
};
