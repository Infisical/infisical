import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { TSlackIntegrations } from "@app/db/schemas/slack-integrations";
import { TWorkflowIntegrations } from "@app/db/schemas/workflow-integrations";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TSlackIntegrationDALFactory = ReturnType<typeof slackIntegrationDALFactory>;

export const slackIntegrationDALFactory = (db: TDbClient) => {
  const slackIntegrationOrm = ormify(db, TableName.SlackIntegrations);

  const findByIdWithWorkflowIntegrationDetails = async (id: string, tx?: Knex) => {
    try {
      return await (tx || db.replicaNode())(TableName.SlackIntegrations)
        .join(
          TableName.WorkflowIntegrations,
          `${TableName.SlackIntegrations}.id`,
          `${TableName.WorkflowIntegrations}.id`
        )
        .select(selectAllTableCols(TableName.SlackIntegrations))
        .select(db.ref("orgId").withSchema(TableName.WorkflowIntegrations))
        .select(db.ref("description").withSchema(TableName.WorkflowIntegrations))
        .select(db.ref("integration").withSchema(TableName.WorkflowIntegrations))
        .select(db.ref("slug").withSchema(TableName.WorkflowIntegrations))
        .where(`${TableName.WorkflowIntegrations}.id`, "=", id)
        .first();
    } catch (error) {
      throw new DatabaseError({ error, name: "Find by ID with Workflow integration details" });
    }
  };

  const findWithWorkflowIntegrationDetails = async (
    filter: Partial<TSlackIntegrations> & Partial<TWorkflowIntegrations>,
    tx?: Knex
  ) => {
    try {
      return await (tx || db.replicaNode())(TableName.SlackIntegrations)
        .join(
          TableName.WorkflowIntegrations,
          `${TableName.SlackIntegrations}.id`,
          `${TableName.WorkflowIntegrations}.id`
        )
        .select(selectAllTableCols(TableName.SlackIntegrations))
        .select(db.ref("orgId").withSchema(TableName.WorkflowIntegrations))
        .select(db.ref("description").withSchema(TableName.WorkflowIntegrations))
        .select(db.ref("integration").withSchema(TableName.WorkflowIntegrations))
        .select(db.ref("slug").withSchema(TableName.WorkflowIntegrations))
        .where(filter);
    } catch (error) {
      throw new DatabaseError({ error, name: "Find with Workflow integration details" });
    }
  };

  return { ...slackIntegrationOrm, findByIdWithWorkflowIntegrationDetails, findWithWorkflowIntegrationDetails };
};
