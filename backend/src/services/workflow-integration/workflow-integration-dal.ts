import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify } from "@app/lib/knex";

export type TWorkflowIntegrationDALFactory = ReturnType<typeof workflowIntegrationDALFactory>;

export const workflowIntegrationDALFactory = (db: TDbClient) => {
  const workflowIntegrationOrm = ormify(db, TableName.WorkflowIntegrations);

  return workflowIntegrationOrm;
};
